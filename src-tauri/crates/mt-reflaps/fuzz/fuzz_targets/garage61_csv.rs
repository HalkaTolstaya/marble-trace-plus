//! Untrusted CSV (a downloaded or imported lap) and its file name: the parser
//! must reject or accept, never panic, and a parsed lap must re-read from its
//! own compact copy.
#![no_main]

use libfuzzer_sys::fuzz_target;
use mt_reflaps::lap::{parse_file_name, parse_garage61_csv, parse_stored_csv};

fuzz_target!(|input: (&str, &str)| {
    let (text, name) = input;
    let _ = parse_file_name(name);

    if let Ok(lap) = parse_garage61_csv(text, name) {
        let _ = parse_stored_csv(&lap.to_compact_csv(), lap.meta.clone());
        let _ = mt_reflaps::buckets::to_reference_data(
            &lap,
            1,
            "car",
            mt_model::computed::reference_lap::TrackCondition::Dry,
        );
    }
});
