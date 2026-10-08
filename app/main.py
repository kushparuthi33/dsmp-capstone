"""Gurgaon price predictor - FastAPI wrapper around the tuned scikit-learn pipeline.

Run from the project root:   uvicorn app.main:app --reload
Then open:                   http://127.0.0.1:8000
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "pipeline_claude.pkl"
OPTIONS_PATH = ROOT / "models" / "options_claude.json"
LISTINGS_PATH = ROOT / "data" / "processed" / "gurgaon_properties_post_feature_selection_claude_v2.csv"
STATIC = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Gurgaon price predictor", docs_url="/api/docs")


def load_model():
    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"{MODEL_PATH} is missing. Run the CLAUDE MODEL SELECTION section of "
            "notebooks/model-selection.ipynb to export it."
        )
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


pipeline = load_model()
options = json.loads(OPTIONS_PATH.read_text())
listings = pd.read_csv(LISTINGS_PATH)          # the training rows, used to place a prediction in its market
FEATURES = [
    "property_type", "sector", "bedRoom", "bathroom", "balcony", "agePossession",
    "built_up_area", "servant room", "store room", "furnishing_type",
    "luxury_category", "floor_category",
]


class Property(BaseModel):
    property_type: str
    sector: str
    bedRoom: int = Field(ge=1, le=10)
    bathroom: int = Field(ge=1, le=12)
    balcony: str
    agePossession: str
    built_up_area: float = Field(gt=0, le=40000)
    servant_room: int = Field(ge=0, le=1, alias="servant room")
    store_room: int = Field(ge=0, le=1, alias="store room")
    furnishing_type: str
    luxury_category: str
    floor_category: str

    model_config = {"populate_by_name": True}


@app.get("/api/options")
def get_options():
    """Everything the form needs: the choices per field, the numeric ranges, the model's accuracy."""
    return options


@app.post("/api/predict")
def predict(prop: Property):
    row = prop.model_dump(by_alias=True)
    for field in ("property_type", "sector", "balcony", "agePossession",
                  "furnishing_type", "luxury_category", "floor_category"):
        allowed = options[field]
        if row[field] not in allowed:
            raise HTTPException(422, f"{field} must be one of the listed values")
    frame = pd.DataFrame([row])[FEATURES]
    try:
        predicted = float(np.expm1(pipeline.predict(frame))[0])
    except Exception as exc:  # the pipeline rejects a combination it cannot encode
        raise HTTPException(500, f"the model could not score this property: {exc}") from exc

    comparables = listings[(listings["sector"] == row["sector"]) & (listings["property_type"] == row["property_type"])]
    if len(comparables) < 12:
        comparables = listings[listings["property_type"] == row["property_type"]]

    band = options["_band"]          # log space half width that held _coverage of the test errors
    low, high = predicted * np.exp(-band), predicted * np.exp(band)
    return {
        "price": round(predicted, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "per_sqft": round(predicted * 1e7 / row["built_up_area"]),
        "coverage": round(options["_coverage"] * 100),
        "market": market_context(comparables, predicted, row),
    }


def market_context(comparables, predicted, row):
    """Where this prediction sits among the listings it was trained on."""
    prices = comparables["price"].to_numpy()
    psf = (comparables["price"] * 1e7 / comparables["built_up_area"]).to_numpy()
    edges = np.quantile(prices, np.linspace(0, 1, 13))          # 12 buckets of equal listing count
    edges = np.unique(np.round(edges, 3))
    counts, _ = np.histogram(prices, bins=edges)
    sample = np.sort(prices)[:: max(1, len(prices) // 120)][:120]
    return {
        "n": int(len(comparables)),
        "prices": [round(float(v), 3) for v in sample],   # one tower per comparable listing
        "scope": "sector" if comparables["sector"].nunique() == 1 else "city",
        "bins": [{"from": float(edges[i]), "to": float(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)],
        "position": float(np.clip((prices < predicted).mean(), 0, 1)),
        "median": round(float(np.median(prices)), 2),
        "median_per_sqft": round(float(np.median(psf))),
        "cheaper_than": round(float((prices > predicted).mean()) * 100),
    }


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")
