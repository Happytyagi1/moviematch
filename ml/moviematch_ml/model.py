"""Hybrid movie embedding model.

Every movie gets one unit-length vector that fuses two views:

* **Collaborative**: truncated SVD of the user-centred rating matrix. Movies
  liked by the same people end up close together.
* **Content**: Latent Semantic Analysis (TF-IDF + SVD) over genres and the
  free-text tags MovieLens users attached to each movie. This lets new or
  rarely rated movies still be recommended (cold start).

Because each half is L2-normalised and weighted by sqrt(alpha) / sqrt(1-alpha),
the dot product of two hybrid vectors equals
``alpha * cos_collab + (1 - alpha) * cos_content``.

A user is represented by the weighted sum of the movies they liked (+) and
disliked (-). That "fold-in" needs no retraining, so a new user who has just
finished the onboarding quiz gets personalised results instantly; the Node
API does exactly the same arithmetic at request time.
"""
from __future__ import annotations

import math
from collections import Counter

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import svds

from .data import Dataset


def l2_normalize(matrix: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """Scale every row to unit Euclidean length (all-zero rows stay zero).

    Parameters
    ----------
    matrix : np.ndarray, shape (n, d)
    eps : float, default 1e-9
        Guards against division by zero.

    Returns
    -------
    np.ndarray, shape (n, d)
    """
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.maximum(norms, eps)


# ---------------------------------------------------------------- collaborative
def collaborative_factors(ds: Dataset, mask: np.ndarray, k: int = 48, shrink: float = 10.0) -> np.ndarray:
    """Item factors from a truncated SVD of the mean-centred rating matrix.

    Parameters
    ----------
    ds : Dataset
        Loaded MovieLens dataset.
    mask : np.ndarray of bool, shape (n_ratings,)
        Ratings to learn from (the train split during evaluation).
    k : int, default 48
        Number of latent factors (rank of the approximation).
    shrink : float, default 10.0
        Bayesian shrinkage of each user's mean toward the global mean, so a
        user with one 5-star rating doesn't get a mean of 5.

    Returns
    -------
    np.ndarray, shape (n_items, k)
        Unit-length item vectors ``V * sqrt(S)``.
    """
    users, items = ds.r_user[mask], ds.r_item[mask]
    ratings = ds.r_value[mask].astype(np.float64)
    sums = np.bincount(users, weights=ratings, minlength=ds.n_users)
    counts = np.bincount(users, minlength=ds.n_users)
    global_mean = ratings.mean()
    user_mean = (sums + shrink * global_mean) / (counts + shrink)
    centred = ratings - user_mean[users]
    rating_matrix = csr_matrix((centred, (users, items)), shape=(ds.n_users, ds.n_items))
    k = min(k, min(rating_matrix.shape) - 1)
    _, singular_values, vt = svds(rating_matrix, k=k, random_state=0)
    order = np.argsort(-singular_values)
    singular_values, vt = singular_values[order], vt[order]
    item_factors = vt.T * np.sqrt(singular_values)
    return l2_normalize(item_factors)


# ---------------------------------------------------------------------- content
def content_documents(ds: Dataset, max_tags: int = 25) -> list[Counter]:
    """Turn each movie's genres and user tags into a bag of weighted tokens.

    Parameters
    ----------
    ds : Dataset
    max_tags : int, default 25
        Keep only the most frequent tags per movie.

    Returns
    -------
    list of Counter
        Tokens look like ``genre:sci-fi``, ``tag:twist ending`` and ``word:twist``.
    """
    docs = []
    for genres, tags in zip(ds.genres, ds.tags):
        doc = Counter({f"genre:{g.lower()}": 3 for g in genres})  # genres are strong signals
        for tag, count in tags.most_common(max_tags):
            doc[f"tag:{tag}"] += count
            for word in tag.split():
                if len(word) > 2:
                    doc[f"word:{word}"] += count
        docs.append(doc)
    return docs


def tfidf(docs: list[Counter], min_df: int = 2) -> tuple[csr_matrix, list[str]]:
    """Sublinear TF-IDF with smoothed IDF and L2-normalised rows.

    Parameters
    ----------
    docs : list of Counter
        Token counts per document.
    min_df : int, default 2
        Drop tokens appearing in fewer documents (genre tokens are always kept).

    Returns
    -------
    matrix : scipy.sparse.csr_matrix, shape (n_docs, n_terms)
    vocabulary : list of str
    """
    doc_freq = Counter(token for doc in docs for token in doc)
    vocabulary = sorted(t for t, c in doc_freq.items() if c >= min_df or t.startswith("genre:"))
    index = {t: j for j, t in enumerate(vocabulary)}
    n_docs = len(docs)
    idf = np.array([math.log((1 + n_docs) / (1 + doc_freq[t])) + 1 for t in vocabulary])
    rows, cols, vals = [], [], []
    for i, doc in enumerate(docs):
        for token, count in doc.items():
            j = index.get(token)
            if j is not None:
                rows.append(i)
                cols.append(j)
                vals.append((1 + math.log(count)) * idf[j])  # sublinear tf
    matrix = csr_matrix((vals, (rows, cols)), shape=(n_docs, len(vocabulary)))
    norms = np.sqrt(np.asarray(matrix.multiply(matrix).sum(axis=1)).ravel())
    norms[norms == 0] = 1
    return csr_matrix(matrix.multiply(1 / norms[:, None])), vocabulary


def content_factors(ds: Dataset, k: int = 32) -> np.ndarray:
    """Latent Semantic Analysis embedding of genres + tags.

    Parameters
    ----------
    ds : Dataset
    k : int, default 32
        Number of latent topics.

    Returns
    -------
    np.ndarray, shape (n_items, k)
        Unit-length content vectors (all-zero for movies with no genres or tags).
    """
    matrix, _ = tfidf(content_documents(ds))
    k = min(k, min(matrix.shape) - 1)
    u, singular_values, _ = svds(matrix, k=k, random_state=0)
    return l2_normalize(u * singular_values)


# ----------------------------------------------------------------------- hybrid
def hybrid(collab: np.ndarray, content: np.ndarray, alpha: float) -> np.ndarray:
    """Fuse the two views so that ``dot = alpha*cos_collab + (1-alpha)*cos_content``.

    Parameters
    ----------
    collab : np.ndarray, shape (n_items, k_collab)
        Unit-length collaborative vectors.
    content : np.ndarray, shape (n_items, k_content)
        Unit-length content vectors.
    alpha : float in [0, 1]
        Weight of the collaborative view.

    Returns
    -------
    np.ndarray of float32, shape (n_items, k_collab + k_content)
        Unit-length hybrid vectors.
    """
    fused = np.hstack([math.sqrt(alpha) * collab, math.sqrt(1 - alpha) * content])
    # Re-normalise: a movie with no genres/tags has an all-zero content half and
    # would otherwise be unfairly down-ranked. For every other row this is a no-op.
    return l2_normalize(fused).astype(np.float32)


def popularity_prior(ds: Dataset, mask: np.ndarray | None = None) -> np.ndarray:
    """Log-scaled rating count per movie, normalised to [0, 1].

    Parameters
    ----------
    ds : Dataset
    mask : np.ndarray of bool, optional
        Count only these ratings (use the train split to avoid leakage).

    Returns
    -------
    np.ndarray of float32, shape (n_items,)
    """
    items = ds.r_item if mask is None else ds.r_item[mask]
    counts = np.bincount(items, minlength=ds.n_items).astype(np.float64)
    prior = np.log1p(counts)
    return (prior / prior.max()).astype(np.float32)


def quality_prior(ds: Dataset, m: float = 20.0) -> np.ndarray:
    """Bayesian-average star rating (IMDb-style), shrunk toward the global mean.

    Parameters
    ----------
    ds : Dataset
    m : float, default 20.0
        Pseudo-count: how many "average" ratings every movie starts with.

    Returns
    -------
    np.ndarray of float32, shape (n_items,)
    """
    sums = np.bincount(ds.r_item, weights=ds.r_value, minlength=ds.n_items)
    counts = np.bincount(ds.r_item, minlength=ds.n_items)
    global_mean = ds.r_value.mean()
    return ((sums + m * global_mean) / (counts + m)).astype(np.float32)


def user_profiles(ds: Dataset, mask: np.ndarray, emb: np.ndarray) -> np.ndarray:
    """Fold users into the item space: profile = sum(weight * item_vector).

    Weights are +1 for ratings >= 4, -0.5 for ratings <= 2, and 0 otherwise,
    the same rule the production API applies to likes and dislikes.

    Parameters
    ----------
    ds : Dataset
    mask : np.ndarray of bool, shape (n_ratings,)
        Ratings that form each user's history.
    emb : np.ndarray, shape (n_items, d)
        Item embeddings.

    Returns
    -------
    np.ndarray, shape (n_users, d)
        Unit-length taste vectors.
    """
    users, items, ratings = ds.r_user[mask], ds.r_item[mask], ds.r_value[mask]
    weights = np.where(ratings >= 4, 1.0, np.where(ratings <= 2, -0.5, 0.0))
    interaction = csr_matrix((weights, (users, items)), shape=(ds.n_users, ds.n_items))
    return l2_normalize(np.asarray(interaction @ emb))
