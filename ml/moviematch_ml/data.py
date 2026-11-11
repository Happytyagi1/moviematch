"""Loading and cleaning the MovieLens `ml-latest-small` dataset.

Only the standard library + numpy are used so the pipeline runs anywhere
(including slim Docker images and locked-down Windows machines).
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

YEAR_RE = re.compile(r"\((\d{4})\)\s*$")
# "Matrix, The (1999)" -> "The Matrix"
ARTICLE_RE = re.compile(r"^(.*), (The|A|An|Les|La|Le|L'|Il|Das|Der|Die|El)$")


def clean_title(raw: str) -> tuple[str, int | None]:
    """Split a MovieLens title into (display title, year)."""
    raw = raw.strip()
    year = None
    m = YEAR_RE.search(raw)
    if m:
        year = int(m.group(1))
        raw = raw[: m.start()].strip()
    # Alternate titles in parentheses: "City of Lost Children, The (Cité des ...)"
    alt = ""
    paren = re.match(r"^(.*?)\s*(\(.*\))$", raw)
    if paren:
        raw, alt = paren.group(1).strip(), paren.group(2)
    m = ARTICLE_RE.match(raw)
    if m:
        art = m.group(2)
        raw = f"{art}{'' if art.endswith(chr(39)) else ' '}{m.group(1)}"
    return raw, year


@dataclass
class Dataset:
    movie_ids: np.ndarray            # (I,) MovieLens ids, index -> id
    titles: list[str]
    years: list[int | None]
    genres: list[list[str]]
    imdb: list[str]
    tmdb: list[int | None]
    tags: list[Counter]              # tag counts per movie
    # ratings as parallel arrays (indices into users / movies)
    r_user: np.ndarray
    r_item: np.ndarray
    r_value: np.ndarray
    r_time: np.ndarray
    n_users: int
    genre_vocab: list[str] = field(default_factory=list)

    @property
    def n_items(self) -> int:
        return len(self.movie_ids)


def _read_csv(path: Path):
    with open(path, encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


def load_movielens(data_dir: str | Path, min_ratings: int = 5) -> Dataset:
    """Load MovieLens and keep only movies with at least `min_ratings` ratings."""
    d = Path(data_dir)

    ratings = list(_read_csv(d / "ratings.csv"))
    counts = Counter(int(r["movieId"]) for r in ratings)
    keep = {mid for mid, c in counts.items() if c >= min_ratings}

    movies = {}
    for row in _read_csv(d / "movies.csv"):
        mid = int(row["movieId"])
        if mid not in keep:
            continue
        title, year = clean_title(row["title"])
        g = [] if row["genres"] == "(no genres listed)" else row["genres"].split("|")
        movies[mid] = (title, year, g)

    links = {}
    for row in _read_csv(d / "links.csv"):
        mid = int(row["movieId"])
        tm = row["tmdbId"].strip()
        links[mid] = (row["imdbId"].strip(), int(tm) if tm else None)

    tags: dict[int, Counter] = defaultdict(Counter)
    for row in _read_csv(d / "tags.csv"):
        mid = int(row["movieId"])
        if mid in movies:
            t = row["tag"].strip().lower()
            if t:
                tags[mid][t] += 1

    ids = np.array(sorted(movies), dtype=np.int64)
    index = {int(m): i for i, m in enumerate(ids)}

    user_ids = sorted({int(r["userId"]) for r in ratings})
    uindex = {u: i for i, u in enumerate(user_ids)}

    rows = [r for r in ratings if int(r["movieId"]) in index]
    r_user = np.fromiter((uindex[int(r["userId"])] for r in rows), np.int32, len(rows))
    r_item = np.fromiter((index[int(r["movieId"])] for r in rows), np.int32, len(rows))
    r_value = np.fromiter((float(r["rating"]) for r in rows), np.float32, len(rows))
    r_time = np.fromiter((int(r["timestamp"]) for r in rows), np.int64, len(rows))

    genre_vocab = sorted({g for _, _, gs in movies.values() for g in gs})

    return Dataset(
        movie_ids=ids,
        titles=[movies[m][0] for m in ids],
        years=[movies[m][1] for m in ids],
        genres=[movies[m][2] for m in ids],
        imdb=[links.get(int(m), ("", None))[0] for m in ids],
        tmdb=[links.get(int(m), ("", None))[1] for m in ids],
        tags=[tags.get(int(m), Counter()) for m in ids],
        r_user=r_user,
        r_item=r_item,
        r_value=r_value,
        r_time=r_time,
        n_users=len(user_ids),
        genre_vocab=genre_vocab,
    )


def temporal_split(ds: Dataset, test_frac: float = 0.2, seed: int = 42):
    """Per-user temporal split: each user's most recent `test_frac` ratings go to test.

    Mirrors the real use-case: we know a user's past taste and must predict
    what they will enjoy next.
    """
    order = np.lexsort((ds.r_time, ds.r_user))
    users = ds.r_user[order]
    test_mask = np.zeros(len(order), dtype=bool)
    starts = np.flatnonzero(np.r_[True, users[1:] != users[:-1]])
    ends = np.r_[starts[1:], len(order)]
    for s, e in zip(starts, ends):
        n_test = int(round((e - s) * test_frac))
        if n_test > 0 and (e - s) - n_test >= 3:
            test_mask[order[e - n_test : e]] = True
    return ~test_mask, test_mask
