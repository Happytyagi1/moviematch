import json
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from moviematch_ml.data import Dataset, clean_title, temporal_split
from moviematch_ml.evaluate import rank_metrics
from moviematch_ml.model import (
    collaborative_factors,
    content_factors,
    hybrid,
    l2_normalize,
    popularity_prior,
    tfidf,
    user_profiles,
)

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "raw,title,year",
    [
        ("Matrix, The (1999)", "The Matrix", 1999),
        ("Toy Story (1995)", "Toy Story", 1995),
        ("City of Lost Children, The (Cité des enfants perdus, La) (1995)", "The City of Lost Children", 1995),
        ("American President, An (1995)", "An American President", 1995),
        ("Untitled", "Untitled", None),
    ],
)
def test_clean_title(raw, title, year):
    assert clean_title(raw) == (title, year)


def tiny_dataset() -> Dataset:
    """Two taste clusters: users 0-3 love items 0-2 (animation), users 4-7 love 3-5 (horror)."""
    users, items, vals, times = [], [], [], []
    t = 0
    for u in range(8):
        fav = range(0, 3) if u < 4 else range(3, 6)
        other = range(3, 6) if u < 4 else range(0, 3)
        for i in fav:
            users.append(u); items.append(i); vals.append(5.0); times.append(t); t += 1
        for i in list(other)[:1]:
            users.append(u); items.append(i); vals.append(1.0); times.append(t); t += 1
    genres = [["Animation"]] * 3 + [["Horror"]] * 3
    return Dataset(
        movie_ids=np.arange(6),
        titles=[f"m{i}" for i in range(6)],
        years=[2000] * 6,
        genres=genres,
        imdb=[""] * 6,
        tmdb=[None] * 6,
        tags=[Counter({"pixar": 2})] * 3 + [Counter({"scary": 2})] * 3,
        r_user=np.array(users, np.int32),
        r_item=np.array(items, np.int32),
        r_value=np.array(vals, np.float32),
        r_time=np.array(times, np.int64),
        n_users=8,
        genre_vocab=["Animation", "Horror"],
    )


def test_l2_normalize_unit_rows():
    x = l2_normalize(np.array([[3.0, 4.0], [0.0, 0.0]]))
    assert np.allclose(np.linalg.norm(x[0]), 1)
    assert np.all(np.isfinite(x))


def test_temporal_split_holds_out_latest():
    ds = tiny_dataset()
    train, test = temporal_split(ds, test_frac=0.25)
    assert not np.any(train & test)
    for u in range(ds.n_users):
        tr = ds.r_time[train & (ds.r_user == u)]
        te = ds.r_time[test & (ds.r_user == u)]
        if len(te):
            assert tr.max() < te.min()


def test_tfidf_rows_normalised():
    x, vocab = tfidf([Counter({"a": 2, "b": 1}), Counter({"a": 1, "c": 1}), Counter({"b": 1, "c": 1})], min_df=1)
    norms = np.sqrt(np.asarray(x.multiply(x).sum(axis=1)).ravel())
    assert np.allclose(norms, 1)
    assert vocab == ["a", "b", "c"]


def test_hybrid_dot_is_weighted_cosine():
    rng = np.random.default_rng(0)
    a, b = l2_normalize(rng.normal(size=(5, 4))), l2_normalize(rng.normal(size=(5, 3)))
    h = hybrid(a, b, 0.7)
    assert np.allclose(np.linalg.norm(h, axis=1), 1, atol=1e-5)
    assert np.isclose(h[0] @ h[1], 0.7 * a[0] @ a[1] + 0.3 * b[0] @ b[1], atol=1e-5)


def test_model_separates_taste_clusters():
    ds = tiny_dataset()
    full = np.ones(len(ds.r_user), bool)
    emb = hybrid(collaborative_factors(ds, full, k=3), content_factors(ds, k=2), 0.5)
    sims = emb @ emb.T
    assert sims[0, 1] > sims[0, 4]  # animation closer to animation than to horror
    prof = user_profiles(ds, full, emb)
    scores = prof @ emb.T
    assert scores[0, :3].mean() > scores[0, 3:].mean()  # animation fan
    assert scores[5, 3:].mean() > scores[5, :3].mean()  # horror fan


def test_popularity_prior_range():
    p = popularity_prior(tiny_dataset())
    assert p.max() == pytest.approx(1.0) and p.min() >= 0


def test_rank_metrics_perfect_and_empty():
    scores = np.array([[0.9, 0.8, 0.1, 0.0], [0.0, 0.1, 0.2, 0.3]])
    m = rank_metrics(scores, [{3}, {0}], [{0, 1}, set()], k=2)
    assert m["recall@2"] == 1.0 and m["ndcg@2"] == pytest.approx(1.0) and m["users"] == 1


@pytest.mark.skipif(not (ROOT.parent / "backend/model/model.json").exists(), reason="model not exported")
def test_exported_artifact_is_consistent():
    meta = json.loads((ROOT.parent / "backend/model/model.json").read_text(encoding="utf-8"))
    emb = np.fromfile(ROOT.parent / "backend/model/embeddings.bin", dtype="<f4")
    assert emb.size == meta["count"] * meta["dim"] == len(meta["movies"]) * meta["dim"]
    assert np.allclose(np.linalg.norm(emb.reshape(meta["count"], meta["dim"]), axis=1), 1, atol=1e-4)
    best = meta["evaluation"]["best"]["metrics"]["ndcg@10"]
    assert best > meta["evaluation"]["baselines"]["popularity"]["ndcg@10"]
