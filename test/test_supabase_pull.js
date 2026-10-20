const supabase_url = "https://qtbysadfbkootuscgsri.supabase.co";
const supabase_key = "sb_publishable_1aGgWjC2uWsKk6AAw6uuKA_AhKzLEQN";

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(supabase_url, supabase_key);

const { data, error } = await supabase.from('Test Table').select('*');

const geojson = { type: "FeatureCollection", features: [] };

if (error) {
  console.error(error);
} else {
  let skipped = 0;

  for (const row of data) {
    const lon = parseFloat(row.Longitude_New);
    const lat = parseFloat(row.Latitude_New);

    // Skip rows with missing or invalid coordinates
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      skipped++;
      continue;
    }

    geojson.features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        PROJECT_NUMBER: row["PROJECT_NUMBER"],
        "IN TORONTO?": row["In Toronto?"],
        PROJECT_NAME: row["PROJECT NAME"],
        CLIENT_NAME: row["client"],
        CLIENT_TYPE: row["CLIENT_TYPE"],
        ADDRESS: row["address"],
        PROJECT_TYPE: row["Project Type"],
        PROJECT_FOCUS: row["Project Focus"],
        MUNICIPALITY: row["Municipality/Jurisdiction"],
        WARD: row["Ward (Toronto)"],
        USI_TEAM_MEMBERS: row["USI Team Members"],
        PRINCIPAL_IN_CHARGE: row["Principal in Charge"],
        PROJECT_MANAGER: row["Project Manager"],
        PROJECT_START_YEAR: row["Project Start Date"],
        PROJECT_END_YEAR: row["Project End Date"],
        APPROVAL_YEAR: row["Complete/Approval Year"],
        APPROVAL_TYPE: row["Approval type(s)"],
        APPROVAL_STATUS: row["Approval Status"],
        RESIDENTIAL_UNITS: row["Residential Units"],
        "AFFORDABLE_UNITS_%": row["Affordable Units (%)"],
        AFFORDABLE_UNITS: row["Affordable Units"],
        MAX_NONRES_GFA: row["Max. Non-Residential GFA"],
        MIN_NONRES_GFA: row["Min. Non-Residential GFA"],
        DENSITY: row["Density"],
        HEIGHT_M: row["Height (m)"],
        HEIGHT_ST: row["Height (st)"],
        SITE_AREA_M2: row["Site Area (m2)"],
        BY_LAW_NUM: row["By-Law  Number"],
        MOST_RECENT_REPORT: row["Most Recent Report"],
        NOTES: row["NOTES"]
      }
    });
  }

  console.log(`${geojson.features.length} features, ${skipped} skipped`);
  console.log(geojson);
}