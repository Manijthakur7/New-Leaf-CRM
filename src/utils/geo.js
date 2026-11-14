/* Indian states & union territories — one canonical spelling for every lead,
   whatever the source (manual entry, Excel import, Facebook/Google lead ads,
   website forms). normalizeState() maps abbreviations and old names
   ("UP", "Orissa", "Bombay") to the canonical name; stateFromCity() fills the
   state when only a city was captured. Used by the browser UI and by the
   server engine (src/api/demoRoutes.js), so both give identical results. */
(function(){
  // [canonical name, zone, aliases…]
  const STATES = [
    ['Andhra Pradesh', 'South', 'ap', 'andhra'], ['Arunachal Pradesh', 'North-East', 'ar', 'arunachal'], ['Assam', 'North-East', 'as'],
    ['Bihar', 'East', 'br'], ['Chhattisgarh', 'Central', 'cg', 'ct', 'chattisgarh', 'chhatisgarh'], ['Goa', 'West', 'ga'],
    ['Gujarat', 'West', 'gj', 'gujrat'], ['Haryana', 'North', 'hr'], ['Himachal Pradesh', 'North', 'hp', 'himachal'],
    ['Jharkhand', 'East', 'jh'], ['Karnataka', 'South', 'ka', 'karnatak'], ['Kerala', 'South', 'kl', 'keralam'],
    ['Madhya Pradesh', 'Central', 'mp'], ['Maharashtra', 'West', 'mh', 'maharastra'], ['Manipur', 'North-East', 'mn'],
    ['Meghalaya', 'North-East', 'ml'], ['Mizoram', 'North-East', 'mz'], ['Nagaland', 'North-East', 'nl'],
    ['Odisha', 'East', 'od', 'or', 'orissa'], ['Punjab', 'North', 'pb'], ['Rajasthan', 'West', 'rj'],
    ['Sikkim', 'North-East', 'sk'], ['Tamil Nadu', 'South', 'tn', 'tamilnadu'], ['Telangana', 'South', 'ts', 'tg'],
    ['Tripura', 'North-East', 'tr'], ['Uttar Pradesh', 'North', 'up', 'u.p'], ['Uttarakhand', 'North', 'uk', 'ut', 'uttaranchal'],
    ['West Bengal', 'East', 'wb', 'bengal'],
    ['Andaman and Nicobar Islands', 'East', 'an', 'andaman', 'andaman & nicobar', 'andaman & nicobar islands'],
    ['Chandigarh', 'North', 'ch'], ['Dadra and Nagar Haveli and Daman and Diu', 'West', 'dn', 'dd', 'dnhdd', 'daman', 'diu', 'dadra and nagar haveli', 'daman and diu'],
    ['Delhi', 'North', 'dl', 'new delhi', 'nct of delhi', 'nct delhi', 'delhi ncr', 'ncr'], ['Jammu and Kashmir', 'North', 'jk', 'j&k', 'j & k', 'jammu & kashmir', 'kashmir', 'jammu'],
    ['Ladakh', 'North', 'la', 'leh'], ['Lakshadweep', 'South', 'ld'], ['Puducherry', 'South', 'py', 'pondicherry', 'pondy']
  ];
  const ZONES = ['North', 'South', 'East', 'West', 'Central', 'North-East'];

  // Major cities → state (covers most admission enquiries; extend as needed)
  const CITIES = {
    'Punjab': 'ludhiana amritsar jalandhar patiala bathinda mohali sas nagar pathankot hoshiarpur moga firozpur ferozepur kapurthala sangrur barnala phagwara rajpura khanna muktsar fazilka gurdaspur batala abohar zirakpur kharar',
    'Haryana': 'gurugram gurgaon faridabad panipat ambala karnal rohtak hisar sonipat yamunanagar panchkula sirsa bhiwani jind kurukshetra kaithal rewari palwal bahadurgarh fatehabad jhajjar mahendragarh narnaul',
    'Delhi': 'dwarka rohini saket janakpuri laxmi nagar pitampura karol bagh connaught place',
    'Uttar Pradesh': 'lucknow kanpur noida greater noida ghaziabad agra varanasi prayagraj allahabad meerut bareilly aligarh moradabad gorakhpur saharanpur jhansi mathura firozabad ayodhya faizabad muzaffarnagar shahjahanpur rampur etawah sitapur bulandshahr hapur unnao rae bareli raebareli',
    'Rajasthan': 'jaipur jodhpur udaipur kota ajmer bikaner alwar bhilwara sikar bharatpur sri ganganagar ganganagar pali chittorgarh tonk jhunjhunu churu barmer jaisalmer nagaur hanumangarh',
    'Maharashtra': 'mumbai bombay pune poona nagpur nashik thane aurangabad chhatrapati sambhajinagar solapur kolhapur amravati navi mumbai sangli jalgaon akola latur dhule ahmednagar nanded satara chandrapur vasai virar kalyan panvel',
    'Karnataka': 'bengaluru bangalore mysuru mysore mangaluru mangalore hubballi hubli dharwad belagavi belgaum kalaburagi gulbarga davanagere ballari bellary shivamogga shimoga tumakuru tumkur udupi manipal vijayapura bijapur hassan',
    'Himachal Pradesh': 'shimla solan dharamshala dharamsala mandi kullu manali baddi hamirpur una bilaspur kangra palampur nahan chamba',
    'Bihar': 'patna gaya bhagalpur muzaffarpur darbhanga purnia arrah begusarai katihar munger chhapra saharsa sasaram hajipur bettiah motihari siwan',
    'West Bengal': 'kolkata calcutta siliguri howrah durgapur asansol bardhaman burdwan kharagpur haldia malda baharampur krishnanagar darjeeling',
    'Madhya Pradesh': 'indore bhopal jabalpur gwalior ujjain sagar dewas satna ratlam rewa katni singrauli burhanpur khandwa morena chhindwara',
    'Uttarakhand': 'dehradun haridwar roorkee haldwani rudrapur kashipur rishikesh nainital mussoorie almora pithoragarh',
    'Sikkim': 'gangtok namchi',
    'Gujarat': 'ahmedabad surat vadodara baroda rajkot gandhinagar bhavnagar jamnagar junagadh anand nadiad morbi mehsana bharuch vapi navsari gandhidham',
    'Tamil Nadu': 'chennai madras coimbatore madurai tiruchirappalli trichy salem tirunelveli tiruppur erode vellore thoothukudi tuticorin thanjavur dindigul hosur',
    'Kerala': 'thiruvananthapuram trivandrum kochi cochin ernakulam kozhikode calicut thrissur kollam kannur palakkad alappuzha kottayam malappuram',
    'Telangana': 'hyderabad secunderabad warangal nizamabad karimnagar khammam ramagundam mahbubnagar nalgonda',
    'Andhra Pradesh': 'visakhapatnam vizag vijayawada guntur nellore kurnool tirupati kakinada rajahmundry rajamahendravaram kadapa anantapur eluru ongole',
    'Odisha': 'bhubaneswar cuttack rourkela berhampur brahmapur sambalpur puri balasore baripada',
    'Jharkhand': 'ranchi jamshedpur dhanbad bokaro hazaribagh deoghar giridih',
    'Chhattisgarh': 'raipur bhilai durg bilaspur cg korba rajnandgaon raigarh jagdalpur',
    'Assam': 'guwahati dibrugarh silchar jorhat tezpur nagaon tinsukia',
    'Jammu and Kashmir': 'srinagar anantnag baramulla udhampur kathua sopore',
    'Goa': 'panaji panjim margao vasco da gama mapusa ponda',
    'Chandigarh': 'chandigarh',
    'Puducherry': 'puducherry pondicherry karaikal',
    'Meghalaya': 'shillong tura', 'Manipur': 'imphal', 'Tripura': 'agartala', 'Mizoram': 'aizawl', 'Nagaland': 'kohima dimapur', 'Arunachal Pradesh': 'itanagar',
    'Ladakh': 'leh kargil', 'Andaman and Nicobar Islands': 'port blair'
  };

  const key = (s) => String(s == null ? '' : s).toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const STATE_INDEX = new Map(); const ZONE_OF = {};
  STATES.forEach(([name, zone, ...aliases]) => {
    ZONE_OF[name] = zone;
    [name].concat(aliases).forEach(a => STATE_INDEX.set(key(a), name));
    STATE_INDEX.set(key(name.replace(/ and /g, ' & ')), name);
  });
  const CITY_INDEX = new Map();
  // Multi-word city names are listed first so "navi mumbai" wins over "mumbai"
  const MULTI = ['greater noida', 'navi mumbai', 'rae bareli', 'sri ganganagar', 'port blair', 'vasco da gama', 'connaught place', 'karol bagh', 'laxmi nagar', 'chhatrapati sambhajinagar', 'sas nagar', 'new delhi'];
  Object.entries(CITIES).forEach(([state, list]) => {
    let rest = ' ' + list + ' ';
    MULTI.forEach(m => { if (rest.includes(' ' + m + ' ')){ CITY_INDEX.set(m, state); rest = rest.replace(' ' + m + ' ', ' '); } });
    rest.trim().split(/\s+/).forEach(c => { if (c && !CITY_INDEX.has(c)) CITY_INDEX.set(c, state); });
  });
  CITY_INDEX.set('new delhi', 'Delhi'); CITY_INDEX.set('delhi', 'Delhi');

  /* "UP" → "Uttar Pradesh", "orissa" → "Odisha"; unknown → '' */
  function normalizeState(s){
    const k = key(s); if (!k) return '';
    if (STATE_INDEX.has(k)) return STATE_INDEX.get(k);
    const trimmed = k.replace(/^(state of|the)\s+/, '').replace(/\s+(state|india|ut)$/, '');
    return STATE_INDEX.get(trimmed) || '';
  }
  /* "Ludhiana" → "Punjab"; also handles "Mohali, Punjab" style values */
  function stateFromCity(city){
    const k = key(city); if (!k) return '';
    if (CITY_INDEX.has(k)) return CITY_INDEX.get(k);
    const parts = k.split(/\s*[-/|]\s*|\s{2,}/).concat(String(city).toLowerCase().split(',').map(key));
    for (const p of parts){ if (CITY_INDEX.has(p)) return CITY_INDEX.get(p); const st = normalizeState(p); if (st) return st; }
    return '';
  }
  /* Best canonical state for a lead: explicit state wins, then city. Unrecognised
     non-empty input is kept (title-cased) so nothing typed is lost — e.g. foreign states. */
  function resolveState(state, city){
    const st = normalizeState(state); if (st) return st;
    const fromCity = stateFromCity(city); if (fromCity) return fromCity;
    const raw = String(state == null ? '' : state).trim();
    return raw ? raw.replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60) : '';
  }
  const zoneOf = (state) => ZONE_OF[normalizeState(state)] || (state ? 'Other' : '');

  const NLref = (typeof window !== 'undefined' && window.NL) || (typeof NL !== 'undefined' && NL);
  NLref.geo = { STATES: STATES.map(s => s[0]), ZONES, normalizeState, stateFromCity, resolveState, zoneOf, isIndianState: (s) => !!ZONE_OF[s] };
})();
