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

    band = options["_band"]          # log space half width that held _coverage of the test errors
    low, high = predicted * np.exp(-band), predicted * np.exp(band)
    return {
        "price": round(predicted, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "per_sqft": round(predicted * 1e7 / row["built_up_area"]),
        "coverage": round(options["_coverage"] * 100),
    }


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")
