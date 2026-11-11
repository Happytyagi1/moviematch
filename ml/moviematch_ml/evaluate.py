"""Offline top-K ranking evaluation (Recall@K, NDCG@K, hit rate, catalogue coverage)."""
from __future__ import annotations

import numpy as np


def rank_metrics(
    scores: np.ndarray,
    train_items: list[set[int]],
    test_items: list[set[int]],
    k: int = 10,
) -> dict[str, float]:
    """Score a recommender by how well its top-K list predicts each user's future likes.

    Parameters
    ----------
    scores : np.ndarray, shape (n_users, n_items)
        Higher = more recommended. Items the user already rated are masked out.
    train_items : list of set of int
        Items each user interacted with in the training period (never recommended).
    test_items : list of set of int
        Items each user later rated >= 4 (the ground truth). Users with none are skipped.
    k : int, default 10
        Length of the recommendation list.

    Returns
    -------
    dict
        ``recall@k``, ``ndcg@k``, ``hit_rate@k`` (means over evaluated users),
        ``coverage`` (share of the catalogue recommended to at least one user)
        and ``users`` (number of evaluated users).
    """
    recalls, ndcgs, hits = [], [], []
    recommended: set[int] = set()
    discounts = 1.0 / np.log2(np.arange(2, k + 2))
    for user in range(scores.shape[0]):
        truth = test_items[user]
        if not truth or not train_items[user]:
            continue
        user_scores = scores[user].copy()
        user_scores[list(train_items[user])] = -np.inf
        top = np.argpartition(-user_scores, k)[:k]
        top = top[np.argsort(-user_scores[top])]
        recommended.update(top.tolist())
        relevance = np.array([1.0 if item in truth else 0.0 for item in top])
        n_hits = relevance.sum()
        recalls.append(n_hits / min(k, len(truth)))
        hits.append(1.0 if n_hits else 0.0)
        ideal_dcg = discounts[: min(k, len(truth))].sum()
        ndcgs.append(float((relevance * discounts).sum() / ideal_dcg))
    return {
        f"recall@{k}": float(np.mean(recalls)),
        f"ndcg@{k}": float(np.mean(ndcgs)),
        f"hit_rate@{k}": float(np.mean(hits)),
        "coverage": len(recommended) / scores.shape[1],
        "users": len(recalls),
    }


def positives(ds, mask: np.ndarray, threshold: float = 4.0) -> list[set[int]]:
    """Items each user rated at or above ``threshold`` within ``mask``.

    Parameters
    ----------
    ds : Dataset
        Loaded MovieLens dataset.
    mask : np.ndarray of bool, shape (n_ratings,)
        Which ratings to consider (e.g. the test split).
    threshold : float, default 4.0
        Minimum star rating that counts as "liked".

    Returns
    -------
    list of set of int
        One set of item indices per user.
    """
    out: list[set[int]] = [set() for _ in range(ds.n_users)]
    selected = mask & (ds.r_value >= threshold)
    for user, item in zip(ds.r_user[selected], ds.r_item[selected]):
        out[int(user)].add(int(item))
    return out


def seen(ds, mask: np.ndarray) -> list[set[int]]:
    """Items each user rated (any score) within ``mask``; these are never re-recommended.

    Parameters
    ----------
    ds : Dataset
        Loaded MovieLens dataset.
    mask : np.ndarray of bool, shape (n_ratings,)
        Which ratings to consider (e.g. the train split).

    Returns
    -------
    list of set of int
        One set of item indices per user.
    """
    out: list[set[int]] = [set() for _ in range(ds.n_users)]
    for user, item in zip(ds.r_user[mask], ds.r_item[mask]):
        out[int(user)].add(int(item))
    return out
