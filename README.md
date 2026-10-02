# DSMP Capstone — Real Estate (Gurgaon Flats)

Capstone project for the DSMP course. End-to-end data science workflow on a
real-estate dataset of flat listings.

## Data

- `data/raw/flats.xlsx` — raw scraped listings (original, untouched).

## Layout

```
data/raw/        original immutable data
data/processed/  cleaned / feature-engineered outputs
notebooks/       numbered analysis notebooks
```

## Planned notebooks

1. `01_data_audit.ipynb` — load, inspect, document the raw schema
2. `02_data_cleaning.ipynb` — type fixes, dedupe, missing values
3. `03_eda.ipynb` — univariate / multivariate exploration
4. `04_feature_engineering.ipynb`
5. `05_modelling.ipynb` — price prediction baselines + tuning
