"""Extract GAMS solution sheets from the DICE-2013R Excel workbook into JSON.

The workbook (models/excel/DICE2013R.xlsm) embeds the output of the authoritative
GAMS model on sheets named GAMS*. Those values are the ground truth our
reimplementations are tested against.

Usage:  python reference/extract_gams_reference.py
Writes: reference/gams_<scenario>.json
"""
from __future__ import annotations

import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "models" / "excel" / "DICE2013R.xlsm"
OUT_DIR = ROOT / "reference"

SHEETS = {
    "opt": "GAMSopt",
    "base": "GAMSbase",
    "lim2": "GAMSlim2",
    "stern": "GAMSstern",
    "sterncalib": "GAMSsternCa",
    "copen": "GAMScopen",
}

# Row label in the sheet -> key in the JSON. Time series (60 values) unless
# listed in SCALARS.
SERIES = {
    "Social Time Preference Factor": "rr",
    "Total Factor Productivity": "al",
    "Rate of Growth of Productivity": "ga",
    "Abatement cost function coefficient": "cost1",
    " Backstop Price (1000 USD per ton CO2)": "pbacktime",
    "Sigma (Industrial MTCO2 per 1000 USD [2000]": "sigma",
    "Growth Rate of Sigma": "gsig",
    "Carbon Emissions from Land Use Change": "etree",
    "Proportion of World in Participation": "partfract",
    "Population (millions)": "l",
    "Exogenous Forcing (Watts per Square Meter)": "forcoth",
    "Atmospheric concentration of carbon (GTC)": "MAT",
    "Atmospheric concentration of carbon (ppm)": "MAT_ppm",
    "Concentration in biosphere and upper oceans (GTC)": "MU",
    "Concentration in deep oceans (GTC)": "ML",
    " Cumulative Emissions to date": "CCA",
    "Atmospheric Temperature (deg C above preindustrial)": "TATM",
    "Total Increase in Forcing (Watts per Meter2, preindustrial)": "FORC",
    "Lower Ocean Temperature (deg C above preindustrial)": "TOCEAN",
    "Gross Output (trillion USD)": "YGROSS",
    "Climate Damages (fraction of gross output)": "DAMFRAC",
    "Climate damages (trillion USD)": "DAMAGES",
    "Output post-damages yet pre-abatement": "YNET",
    "Abatement cost (trillion USD)": "ABATECOST",
    "Output (Net of Damages and Abatement, trillion USD pa) ": "Y",
    "Total Carbon Emissions (GTCO2 per year)": "E",
    "Industrial Emissions (GTCO2 per year)": "EIND",
    "World Emissions Intensity (sigma)": "emissions_intensity",
    "Gross Investment (trillion 2005USD per year)": "I",
    "Capital (trillion 2005USD per year)": "K",
    "Consumption (trillion USD per year)": "C",
    "Consumption Per Capita (thousand USD per year)": "CPC",
    "Utility of Consumption": "PERIODU",
    "Savings Rate (proportion of gross output)": "S",
    "Carbon Price (per t CO2)": "CPRICE",
    "Emissions Control Rate (total)": "MIU",
    "Interest Rate (Real Rate of Return)": "RI",
    "Social Cost of Carbon": "SCC",
}
SCALARS = {
    "Total Discounted Utility (trillions 2000USD)": "UTILITY",
}

NPERIODS = 60


def _num(v):
    return float(v) if isinstance(v, (int, float)) else None


def extract_sheet(ws) -> dict:
    out: dict = {"series": {}, "scalars": {}}
    years = None
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=1 + NPERIODS, values_only=True):
        label, values = row[0], row[1:]
        if label == "Year":
            years = [int(v) for v in values]
        if label in SERIES:
            key = SERIES[label]
            if key in out["series"]:  # duplicate rows (e.g. a second SCC row): keep first
                continue
            out["series"][key] = [_num(v) for v in values]
        elif label in SCALARS:
            out["scalars"][SCALARS[label]] = _num(values[0])
    out["years"] = years
    return out


def main() -> None:
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True, read_only=True)
    names = {n.lower(): n for n in wb.sheetnames}
    for scenario, sheet in SHEETS.items():
        ws = wb[names[sheet.lower()]]
        data = extract_sheet(ws)
        data["source"] = f"models/excel/DICE2013R.xlsm, sheet {ws.title}"
        missing = sorted(set(SERIES.values()) - set(data["series"]))
        if missing:
            raise SystemExit(f"{sheet}: missing rows {missing}")
        path = OUT_DIR / f"gams_{scenario}.json"
        path.write_text(json.dumps(data, indent=1) + "\n")
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
