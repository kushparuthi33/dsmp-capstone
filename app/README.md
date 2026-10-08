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

## How it behaves

The estimate follows the form: changing any control reruns the model after a
short pause, the figure counts to its new value, and a chip shows what the last
change was worth. There is no submit button, only a hidden one so the Enter key
still works.

The skyline above the form is a canvas: one tower per comparable listing in the
chosen sector, ordered by price, with the estimate's tower lit and a light
travelling along the row. The card holding it leans back and flattens as you
scroll through it, driven by the CSS scroll timeline where the browser has one
and by an observer gated loop where it does not.

The panel places the estimate in its market: a range bar for the model's error
band, and a histogram of what comparable listings in that sector actually ask,
with the bucket the property falls into picked out.

The shipped model is constrained to rise with built up area, amenities,
furnishing and the servant and store rooms, so moving one of those up can never
lower the price. That costs about 0.009 of R2 against the unconstrained model.
