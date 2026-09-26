# FactorRSI project page

This static page accompanies the current FactorRSI manuscript. Its five-dataset result table reproduces the rounded Qwen3.5-397B-A17B-FP8 values in manuscript Table `tab:combined_single_external_rsi`. These are reported TEST performance extrema, not equal-round or seed-averaged comparisons. The manuscript contains the full evaluation protocol and results for three LLM backbones.

The interactive lineage is a separate historical snapshot of RSI-on factors from CSI300, CSI500, and Numerai through round 250. The `lineage.json` dataset and `explorer.js` / `graph-core.js` interaction code are unchanged from the supplied local project page. Recorded parent identifiers define the edges; layout proximity does not imply ancestry. Factor scores displayed in the explorer are saved validation values and should not be confused with the ensemble TEST results in the table.

The page uses relative asset paths so it can be hosted at a project subpath. It has no backend or telemetry. The older manuscript PDF and matched-round CSV from the local preview are not included because they describe an earlier experimental snapshot.
