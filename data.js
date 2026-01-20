// Soil Sampling Points - Elevation Zone-Based Selection
// 10 points covering elevation range: 192.4m to 194.2m (1.8m variation)
// Elevation zones: High (194m, red), Medium (193m, white), Low (192m, blue)
// Suggested route from H6 (southeast): 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

const SAMPLING_POINTS = [
    { number: 1, grid: 'G3', lat: 28.100198, lon: 77.788817, elevation: 'high' },   // East
    { number: 2, grid: 'F2', lat: 28.100584, lon: 77.788174, elevation: 'high' },   // Northeast
    { number: 3, grid: 'E2', lat: 28.10100, lon: 77.78780, elevation: 'medium' },   // North-central
    { number: 4, grid: 'D3', lat: 28.10050, lon: 77.78720, elevation: 'medium' },   // Central
    { number: 5, grid: 'C2', lat: 28.101098, lon: 77.786547, elevation: 'medium' }, // Northwest
    { number: 6, grid: 'C3', lat: 28.100341, lon: 77.786364, elevation: 'low' },    // West
    { number: 7, grid: 'B4', lat: 28.099788, lon: 77.785699, elevation: 'low' },    // Southwest
    { number: 8, grid: 'D5', lat: 28.099844, lon: 77.787030, elevation: 'low' },    // South
    { number: 9, grid: 'G4', lat: 28.09960, lon: 77.78780, elevation: 'medium' },   // East-central
    { number: 10, grid: 'H5', lat: 28.099366, lon: 77.788489, elevation: 'high' }   // Southeast
];

// Plot boundary polygon from plot_map_kml.kml
// Coordinates in [lat, lon] format for Leaflet
const PLOT_POLYGON = [
    [28.10046115640565, 77.78939804167037],
    [28.10079793697927, 77.78880428908039],
    [28.10146028547256, 77.78805542636508],
    [28.10161310587113, 77.78795331429811],
    [28.10154117498568, 77.78751166178249],
    [28.10103086916328, 77.78709710495055],
    [28.10114658934855, 77.78695277538301],
    [28.10151028147857, 77.78643910280523],
    [28.10118076006495, 77.78606212097766],
    [28.10082846323772, 77.78645358561086],
    [28.10081471087444, 77.78647221876281],
    [28.1006159018711, 77.7863030906033],
    [28.10040242821022, 77.78614069441018],
    [28.10063316220857, 77.78580010841193],
    [28.09989519081241, 77.78530893094901],
    [28.09985458401478, 77.78536856592865],
    [28.09952960181319, 77.78505320479195],
    [28.09925473411002, 77.78553387470014],
    [28.09996902328279, 77.78651655823099],
    [28.09933055517165, 77.78718691116667],
    [28.09940343189318, 77.787303763964],
    [28.09922643177073, 77.78752543921395],
    [28.09863109826777, 77.78868069567859],
    [28.10046115640565, 77.78939804167037]
];

// Entry point H6 (southeast corner)
const ENTRY_POINT = {
    lat: 28.09863,
    lon: 77.78868,
    description: 'Entry Point H6 (Southeast corner)'
};

// Map center
const MAP_CENTER = {
    lat: 28.100,
    lon: 77.787
};

// Field observation options
const OBSERVATION_OPTIONS = {
    whiteDeposits: ['Yes', 'Slight', 'No'],
    soilColor: ['Dark', 'Medium', 'Pale'],
    waterlogging: ['Yes', 'No'],
    compaction: ['Yes', 'No'],
    vegetation: ['Healthy', 'Stunted', 'Patchy', 'Absent']
};

// Equipment checklist
const EQUIPMENT_CHECKLIST = [
    'Khurpi/trowel',
    'Sample bags (10+)',
    'Permanent marker',
    'Labels',
    'Bucket for mixing',
    'Tape measure (15cm depth)',
    'Field notebook',
    'Phone (charged)',
    'Water bottle'
];
