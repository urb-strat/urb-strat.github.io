"""
Combine duplicate columns in the merged master database.

Run 1:  python clean_duplicates.py
        -> cleaned.xlsx      (combined columns, a NEEDS REVIEW flag)
        -> review.xlsx       (only the real conflicts, one row per field)
Then:   in review.xlsx, change the KEEP column wherever you disagree, save.
Run 2:  python clean_duplicates.py   (your KEEP choices are applied to cleaned.xlsx)
If merged.xlsx changes later, delete review.xlsx first so the review starts fresh.
"""
import re
from pathlib import Path
import pandas as pd

BASE = Path(__file__).parent
INPUT_FILE = BASE / "data_for_cleaning/USI_FULL_Database_Cleaned.xlsx"
OUTPUT_FILE = BASE / "data_for_cleaning/cleaned.xlsx"
REVIEW_FILE = BASE / "data_for_cleaning/review.xlsx"

# Output column name: source columns in PRIORITY order (first = preferred when values conflict)
TEXT_GROUPS = {
    "PROJECT NAME": ["PROJECT NAME", "Name"],          # remove if Name is a site name, not a duplicate
    "ADDRESS":      ["address", "address6"],             # LOCATION left alone: it holds city names, not addresses
}
LIST_GROUPS = {   # names from both columns are combined (no review needed)
    "TEAM": ["TEAM ON PROJECT (FULL NAMES)", "USI Team Members"],
}
NOTE_GROUPS = {   # differing notes are joined with " | " instead of flagged
    "NOTES": ["NOTES", "Notes4"],
}
COORD_GROUPS = {  # numbers: prefer first filled value, flag if others differ by more than COORD_TOL
    "LATITUDE":  ["Latitude_New", "Latitude", "LATITUDE2"],
    "LONGITUDE": ["Longitude_New", "Longitude", "LONGITUDE3"],
}
COORD_TOL = 0.001  # degrees, about 100 m

ABBREV = {
    "avenue": "ave", "av": "ave", "street": "st", "road": "rd", "boulevard": "blvd",
    "drive": "dr", "crescent": "cres", "court": "ct", "place": "pl", "highway": "hwy",
    "west": "w", "east": "e", "north": "n", "south": "s", "and": "&",
}


def blank(v):
    return v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() == ""


def norm(v):
    s = re.sub(r"[^\w\s&]", " ", str(v).lower())
    return " ".join(ABBREV.get(w, w) for w in s.split())


def combine_text(values):
    """values = filled values in priority order. Returns (keep, conflicting_others)."""
    # drop values that match or are contained in another (after normalizing); keep the longer
    kept = []
    for v in values:
        n = norm(v)
        merged = False
        for i, k in enumerate(kept):
            nk = norm(k)
            if n == nk or f" {n} " in f" {nk} " or f" {nk} " in f" {n} ":
                if len(n) > len(nk):
                    kept[i] = v   # longer, more complete version wins
                merged = True
                break
        if not merged:
            kept.append(v)
    return kept[0], kept[1:]


def main():
    df = pd.read_excel(INPUT_FILE)
    df.columns = df.columns.str.strip()
    df.insert(0, "ROW_ID", range(2, len(df) + 2))  # = Excel row number in merged.xlsx

    review_rows = []
    flags = [[] for _ in range(len(df))]

    def present(cols, out):
        found = [c for c in cols if c in df.columns]
        for c in cols:
            if c not in df.columns:
                print(f"Warning: column '{c}' not found (group {out}) - skipped")
        return found

    for out, cols in TEXT_GROUPS.items():
        cols = present(cols, out)
        result = []
        for i, row in df[cols].iterrows():
            vals = [str(row[c]).strip() for c in cols if not blank(row[c])]
            if not vals:
                result.append(None)
                continue
            keep, others = combine_text(vals)
            result.append(keep)
            if others:
                flags[i].append(out)
                review_rows.append({"ROW_ID": df.at[i, "ROW_ID"], "PROJECT #": df.at[i, "PROJECT #"],
                                    "FIELD": out, "KEEP": keep, "OTHER VALUES": " || ".join(others)})
        df = df.drop(columns=cols)
        df[out] = result

    for out, cols in LIST_GROUPS.items():
        cols = present(cols, out)
        result = []
        for _, row in df[cols].iterrows():
            names = []
            for c in cols:
                if not blank(row[c]):
                    for n in re.split(r"[,;/\n]", str(row[c])):
                        n = n.strip()
                        if n and n.lower() not in [x.lower() for x in names]:
                            names.append(n)
            result.append(", ".join(names) if names else None)
        df = df.drop(columns=cols)
        df[out] = result

    for out, cols in NOTE_GROUPS.items():
        cols = present(cols, out)
        result = []
        for _, row in df[cols].iterrows():
            vals = [str(row[c]).strip() for c in cols if not blank(row[c])]
            uniq = []
            for v in vals:
                if norm(v) not in [norm(u) for u in uniq]:
                    uniq.append(v)
            result.append(" | ".join(uniq) if uniq else None)
        df = df.drop(columns=cols)
        df[out] = result

    for out, cols in COORD_GROUPS.items():
        cols = present(cols, out)
        result = []
        for i, row in df[cols].iterrows():
            vals = pd.to_numeric(pd.Series([row[c] for c in cols]), errors="coerce").dropna().tolist()
            if not vals:
                result.append(None)
                continue
            keep = vals[0]
            result.append(keep)
            others = [v for v in vals[1:] if abs(v - keep) > COORD_TOL]
            if others:
                flags[i].append(out)
                review_rows.append({"ROW_ID": df.at[i, "ROW_ID"], "PROJECT #": df.at[i, "PROJECT #"],
                                    "FIELD": out, "KEEP": keep, "OTHER VALUES": " || ".join(map(str, others))})
        df = df.drop(columns=cols)
        df[out] = result

    df["NEEDS REVIEW"] = [", ".join(f) for f in flags]

    # Second run: apply the KEEP choices from an edited review file
    if REVIEW_FILE.exists():
        edits = pd.read_excel(REVIEW_FILE)
        applied = 0
        for _, e in edits.iterrows():
            mask = df["ROW_ID"] == e["ROW_ID"]
            if mask.any() and e["FIELD"] in df.columns:
                df.loc[mask, e["FIELD"]] = None if blank(e["KEEP"]) else e["KEEP"]
                applied += 1
        df["NEEDS REVIEW"] = ""
        print(f"Applied {applied} choices from {REVIEW_FILE.name}")
    else:
        pd.DataFrame(review_rows, columns=["ROW_ID", "PROJECT #", "FIELD", "KEEP", "OTHER VALUES"]) \
          .to_excel(REVIEW_FILE, index=False)
        print(f"{len(review_rows)} conflicts written to {REVIEW_FILE.name} - edit KEEP, then run again")

    df.to_excel(OUTPUT_FILE, index=False)
    print(f"Saved {len(df)} rows to {OUTPUT_FILE.name}")


if __name__ == "__main__":
    main()