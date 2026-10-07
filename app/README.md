# Gurgaon price estimate

A small web app around the tuned pipeline exported by
`notebooks/model-selection.ipynb` (the CLAUDE MODEL SELECTION section).

## Run it

```bash
pip install fastapi uvicorn scikit-learn pandas
uvicorn app.main:app --reload
```

Then open http://127.0.0.1:8000

Run the command from the project root, not from inside `app/`.

## What is where

| Path | What it does |
| --- | --- |
| `app/main.py` | FastAPI server. Loads the pickle, serves `/api/options` and `/api/predict`. |
| `app/static/index.html` | The page. |
| `app/static/styles.css` | Design tokens, light and dark. |
| `app/static/app.js` | Builds the form from `/api/options`, calls `/api/predict`. |
| `models/pipeline_claude.pkl` | The trained pipeline. Rebuild it from the notebook. |
| `models/options_claude.json` | Field choices, numeric ranges, model accuracy. |

The API is also browsable at http://127.0.0.1:8000/api/docs

## A caveat worth repeating

The listings were scraped from 99acres in 2023 and carry asking prices, not
sale prices. Treat the output as what a seller in that period would have
asked, not as a valuation.
