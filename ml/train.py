"""Train, evaluate and export the MovieMatch hybrid recommender.

    python train.py --data data/raw/ml-latest-small --out ../backend/model

Steps
1. Temporal per-user split (last 20% of each user's ratings = test).
2. Grid-search alpha (collab vs content weight) and beta (popularity prior)
   on the split, comparing against popularity / content-only / collab-only.
3. Re-fit on 100% of the data with the best settings and export:
     model.json      – movie metadata, priors, hyper-params, metrics
     embeddings.bin  – float32 matrix (n_movies x dim), row-major
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from moviematch_ml.data import load_movielens, temporal_split
from moviematch_ml.evaluate import positives, rank_metrics, seen
from moviematch_ml.model import (
    collaborative_factors,
    content_factors,
    hybrid,
    popularity_prior,
    quality_prior,
    user_profiles,
)

ALPHAS = [0.0, 0.5, 0.7, 0.8, 0.9, 1.0]
BETAS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7]


def evaluate(ds, collab_k: int, content_k: int, k: int = 10, min_coverage: float = 0.2) -> tuple[dict, dict]:
    train, test = temporal_split(ds)
    train_seen, test_pos = seen(ds, train), positives(ds, test)
    collab = collaborative_factors(ds, train, k=collab_k)
    content = content_factors(ds, k=content_k)
    pop = popularity_prior(ds, train)

    results = {"popularity": rank_metrics(np.tile(pop, (ds.n_users, 1)), train_seen, test_pos, k)}
    best = None
    for a in ALPHAS:
        emb = hybrid(collab, content, a)
        prof = user_profiles(ds, train, emb)
        base = prof @ emb.T
        for b in BETAS:
            m = rank_metrics(base + b * pop, train_seen, test_pos, k)
            name = f"hybrid(alpha={a},beta={b})"
            results[name] = m
            # Pure accuracy rewards "recommend blockbusters to everyone"; require
            # a minimum catalogue coverage so results stay personal and diverse.
            ok = m["coverage"] >= min_coverage
            if ok and (best is None or m[f"ndcg@{k}"] > best[1][f"ndcg@{k}"]):
                best = ({"alpha": a, "beta": b}, m)
            print(f"  {name:32s} recall@{k}={m[f'recall@{k}']:.4f} ndcg@{k}={m[f'ndcg@{k}']:.4f} cov={m['coverage']:.3f}")
    return results, {"params": best[0], "metrics": best[1]}


def export(ds, out: Path, alpha: float, beta: float, collab_k: int, content_k: int, report: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    full = np.ones(len(ds.r_user), dtype=bool)
    emb = hybrid(collaborative_factors(ds, full, k=collab_k), content_factors(ds, k=content_k), alpha)
    pop = popularity_prior(ds)
    qual = quality_prior(ds)
    counts = np.bincount(ds.r_item, minlength=ds.n_items)

    movies = []
    for i in range(ds.n_items):
        movies.append({
            "id": int(ds.movie_ids[i]),
            "title": ds.titles[i],
            "year": ds.years[i],
            "genres": ds.genres[i],
            "tags": [t for t, _ in ds.tags[i].most_common(6)],
            "imdbId": ds.imdb[i],
            "tmdbId": ds.tmdb[i],
            "ratingCount": int(counts[i]),
            "rating": round(float(qual[i]), 3),
            "popularity": round(float(pop[i]), 4),
        })

    (out / "embeddings.bin").write_bytes(np.ascontiguousarray(emb, dtype="<f4").tobytes())
    meta = {
        "version": time.strftime("%Y%m%d-%H%M%S"),
        "dataset": "MovieLens ml-latest-small (GroupLens, F. Maxwell Harper & Joseph A. Konstan, 2015)",
        "dim": int(emb.shape[1]),
        "count": int(emb.shape[0]),
        "params": {"alpha": alpha, "beta": beta, "collabDim": collab_k, "contentDim": content_k},
        "genres": ds.genre_vocab,
        "evaluation": report,
        "movies": movies,
    }
    (out / "model.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {emb.shape[0]} movies x {emb.shape[1]} dims -> {out}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/raw/ml-latest-small")
    p.add_argument("--out", default="../backend/model")
    p.add_argument("--collab-k", type=int, default=48)
    p.add_argument("--content-k", type=int, default=32)
    p.add_argument("--min-ratings", type=int, default=5)
    p.add_argument("--min-coverage", type=float, default=0.2)
    args = p.parse_args()

    t0 = time.time()
    ds = load_movielens(args.data, min_ratings=args.min_ratings)
    print(f"Loaded {ds.n_items} movies, {ds.n_users} users, {len(ds.r_user)} ratings")

    results, best = evaluate(ds, args.collab_k, args.content_k, min_coverage=args.min_coverage)
    pop = results["popularity"]
    a, b = best["params"]["alpha"], best["params"]["beta"]
    content_only = results[f"hybrid(alpha=0.0,beta={b})"]
    collab_only = results[f"hybrid(alpha=1.0,beta={b})"]
    print("\nBaselines vs best (NDCG@10):")
    print(f"  popularity   {pop['ndcg@10']:.4f}")
    print(f"  content-only {content_only['ndcg@10']:.4f}")
    print(f"  collab-only  {collab_only['ndcg@10']:.4f}")
    print(f"  BEST hybrid  {best['metrics']['ndcg@10']:.4f}  (alpha={a}, beta={b})")

    report = {
        "split": "per-user temporal 80/20, positives = rating >= 4",
        "selection": f"max NDCG@10 with catalogue coverage >= {args.min_coverage}",
        "best": best,
        "baselines": {"popularity": pop, "contentOnly": content_only, "collabOnly": collab_only},
    }
    export(ds, Path(args.out), a, b, args.collab_k, args.content_k, report)
    print(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
