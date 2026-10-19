// ===== DATA.JS (Final Verified & Safe Version) =====

const DISEASES = [
  {
    id: "wheat_rust",
    crop: "Wheat",
    name_en: "Wheat Rust",
    name_ur: "گندم کا زنگ",
    symptoms: ["yellow or brown pustules on leaves", "powdery spores", "stunted growth"],
    confidence_keywords: ["rust", "pustules", "yellow stripe", "brown rust"]
  },
  {
    id: "potato_late_blight",
    crop: "Potato",
    name_en: "Potato Late Blight",
    name_ur: "آلو کا لیٹ بلائٹ",
    symptoms: ["dark water-soaked lesions on leaves", "white fungal growth under leaves in humid weather", "stem rot"],
    confidence_keywords: ["late blight", "water-soaked", "dark lesions", "blight"]
  },
  {
    id: "tomato_powdery_mildew",
    crop: "Tomato",
    name_en: "Tomato Powdery Mildew",
    name_ur: "ٹماٹر کی سفیدی",
    symptoms: ["white powdery spots on upper leaf surfaces", "yellowing leaves"],
    confidence_keywords: ["powdery mildew", "white spots", "white powder"]
  },
  {
    id: "rice_blast",
    crop: "Rice",
    name_en: "Rice Blast",
    name_ur: "دھان کا بلاسٹ",
    symptoms: ["diamond-shaped lesions on leaves", "neck rot", "gray centers on spots"],
    confidence_keywords: ["blast", "diamond lesions", "neck rot"]
  },
  {
    id: "cotton_leaf_curl_virus",
    crop: "Cotton",
    name_en: "Cotton Leaf Curl Virus",
    name_ur: "کپاس کا لیف کرل وائرس",
    symptoms: ["upward curling of leaves", "thickened veins", "enations on leaf underside"],
    confidence_keywords: ["leaf curl", "clcuv", "upward curling", "thick veins"]
  },
  {
    id: "citrus_canker",
    crop: "Citrus",
    name_en: "Citrus Canker",
    name_ur: "لیموں کا کینکر / ناسور",
    symptoms: ["raised corky lesions", "yellow halo around spots"],
    confidence_keywords: ["canker", "yellow halo", "citrus"]
  }
];

const DISEASE_TO_INGREDIENT = {
  "wheat_rust": ["Propiconazole", "Tebuconazole"],
  "potato_late_blight": ["Mandipropamid + Chlorothalonil", "Cymoxanil + Mancozeb"],
  "tomato_powdery_mildew": ["Sulfur", "Difenoconazole"],
  "rice_blast": ["Tricyclazole", "Azoxystrobin"],
  "cotton_leaf_curl_virus": ["Thiamethoxam", "Acetamiprid"],
  "citrus_canker": ["Copper Hydroxide", "Copper Oxychloride"]
};

const PRODUCTS = [
  // --- WHEAT ---
  {
    name: "Tilt 250 EC",
    type: "fungicide",
    crop: ["Wheat", "Rice"],
    target_disease: "Wheat Rust",
    active_ingredient: "Propiconazole",
    dosage: "200 ml per acre",
    pack_size: "250ml",
    price_pkr: 2100,
    unit_basis: "ml",
    unit_price_pkr: 840,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "35 days", mixing_compatibility: "Do not mix with strong alkaline products", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Folicur 250 EC",
    type: "fungicide",
    crop: ["Wheat"],
    target_disease: "Wheat Leaf Rust",
    active_ingredient: "Tebuconazole",
    dosage: "200 ml per acre",
    pack_size: "250ml",
    price_pkr: 2350,
    unit_basis: "ml",
    unit_price_pkr: 940,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "30 days", mixing_compatibility: "Compatible with most insecticides", re_entry_time_hours: "24 hours" }
  },

  // --- RICE ---
  {
    name: "Beam 75 WP",
    type: "fungicide",
    crop: ["Rice"],
    target_disease: "Rice Blast",
    active_ingredient: "Tricyclazole",
    dosage: "120g per acre",
    pack_size: "120g",
    price_pkr: 950,
    unit_basis: "g",
    unit_price_pkr: 791,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "30 days", mixing_compatibility: "Compatible with common rice pesticides", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Amistar Top 325 SC",
    type: "fungicide",
    crop: ["Wheat", "Rice", "Tomato", "Mango"],
    target_disease: "Rice Blast & Anthracnose",
    active_ingredient: "Azoxystrobin + Difenoconazole",
    dosage: "200ml per acre",
    pack_size: "600ml",
    price_pkr: 4350,
    unit_basis: "ml",
    unit_price_pkr: 725,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Compatible with most insecticides", re_entry_time_hours: "24 hours" }
  },

  // --- POTATO & TOMATO ---
  {
    name: "Orondis Opti 40.6 SC",
    type: "fungicide",
    crop: ["Potato", "Tomato"],
    target_disease: "Late Blight",
    active_ingredient: "Mandipropamid + Chlorothalonil",
    dosage: "250ml per acre",
    pack_size: "400ml",
    price_pkr: 1550,
    unit_basis: "ml",
    unit_price_pkr: 387.5,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "7 days", mixing_compatibility: "Compatible with standard fungicides", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Curzate M 72 WP",
    type: "fungicide",
    crop: ["Potato", "Tomato"],
    target_disease: "Late Blight",
    active_ingredient: "Cymoxanil + Mancozeb",
    dosage: "600g per acre",
    pack_size: "600g",
    price_pkr: 1850,
    unit_basis: "g",
    unit_price_pkr: 308,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Do not mix with oils", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Thiovit Jet 80% WG",
    type: "fungicide",
    crop: ["Tomato", "Mango", "Orchard Crops"],
    target_disease: "Powdery Mildew",
    active_ingredient: "Sulfur",
    dosage: "500g per acre",
    pack_size: "1kg",
    price_pkr: 1100,
    unit_basis: "g",
    unit_price_pkr: 110,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "5 days", mixing_compatibility: "Do not use within 3 weeks of oil sprays", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Score 250 EC",
    type: "fungicide",
    crop: ["Tomato", "Potato", "Mango", "Chilies"],
    target_disease: "Early Blight & Leaf Spots",
    active_ingredient: "Difenoconazole",
    dosage: "100ml per acre",
    pack_size: "250ml",
    price_pkr: 2250,
    unit_basis: "ml",
    unit_price_pkr: 900,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Compatible with insecticides", re_entry_time_hours: "24 hours" }
  },

  // --- COTTON ---
  {
    name: "Actara 25 WG",
    type: "insecticide",
    crop: ["Cotton", "Vegetables"],
    target_disease: "Whitefly & Jassid",
    active_ingredient: "Thiamethoxam",
    dosage: "24g per acre",
    pack_size: "50g",
    price_pkr: 1350,
    unit_basis: "g",
    unit_price_pkr: 2700,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Compatible with most products", re_entry_time_hours: "12 hours" }
  },
  {
    name: "Mospilan 20 SP",
    type: "insecticide",
    crop: ["Cotton", "Citrus", "Vegetables"],
    target_disease: "Aphids & Whitefly",
    active_ingredient: "Acetamiprid",
    dosage: "125g per acre",
    pack_size: "250g",
    price_pkr: 1300,
    unit_basis: "g",
    unit_price_pkr: 520,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "7 days", mixing_compatibility: "Compatible with neutral pesticides", re_entry_time_hours: "12 hours" }
  },
  {
    name: "Priaxor 300 SC",
    type: "fungicide",
    crop: ["Cotton", "Tomato"],
    target_disease: "Target Spot",
    active_ingredient: "Pyraclostrobin + Fluxapyroxad",
    dosage: "200 ml per acre",
    pack_size: "250ml",
    price_pkr: 4200,
    unit_basis: "ml",
    unit_price_pkr: 1680,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Do not mix with alkaline solutions", re_entry_time_hours: "24 hours" }
  },

  // --- OTHER INSECTICIDES ---
  {
    name: "Talstar 10 EC",
    type: "insecticide",
    crop: ["Cotton", "Sugarcane", "Vegetables", "Orchards"],
    target_disease: "Bollworms & Termites",
    active_ingredient: "Bifenthrin",
    dosage: "300ml per acre",
    pack_size: "500ml",
    price_pkr: 1150,
    unit_basis: "ml",
    unit_price_pkr: 230,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Compatible with standard insecticides", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Karate 2.5 EC",
    type: "insecticide",
    crop: ["Cotton", "Rice", "Maize"],
    target_disease: "Leaf Folder & Borers",
    active_ingredient: "Lambda-cyhalothrin",
    dosage: "330ml per acre",
    pack_size: "500ml",
    price_pkr: 980,
    unit_basis: "ml",
    unit_price_pkr: 196,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Standard compatibility", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Match 050 EC",
    type: "insecticide",
    crop: ["Cotton", "Vegetables"],
    target_disease: "American Bollworm (Larvae)",
    active_ingredient: "Lufenuron",
    dosage: "400ml per acre",
    pack_size: "500ml",
    price_pkr: 1750,
    unit_basis: "ml",
    unit_price_pkr: 350,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "21 days", mixing_compatibility: "Standard compatibility", re_entry_time_hours: "24 hours" }
  },

  // --- CITRUS & MANGO ---
  {
    name: "Kocide 2000DF",
    type: "fungicide",
    crop: ["Citrus"],
    target_disease: "Citrus Canker",
    active_ingredient: "Copper Hydroxide",
    dosage: "250g per acre",
    pack_size: "500g",
    price_pkr: 2800,
    unit_basis: "g",
    unit_price_pkr: 560,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "7 days", mixing_compatibility: "Do not mix with acidic compounds", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Karathane LC",
    type: "fungicide",
    crop: ["Mango", "Orchards"],
    target_disease: "Mango Powdery Mildew",
    active_ingredient: "Dinocap",
    dosage: "150 ml per acre",
    pack_size: "250ml",
    price_pkr: 1950,
    unit_basis: "ml",
    unit_price_pkr: 780,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Compatible with most fungicides", re_entry_time_hours: "24 hours" }
  },
  {
    name: "Topsin-M 70WP",
    type: "fungicide",
    crop: ["Sugarcane", "Cotton", "Vegetables"],
    target_disease: "Red Rot & Ascochyta Blight",
    active_ingredient: "Thiophanate-Methyl",
    dosage: "400g per acre",
    pack_size: "500g",
    price_pkr: 2150,
    unit_basis: "g",
    unit_price_pkr: 430,
    store_link: "#",
    in_stock: true,
    precautions_product: { pre_harvest_interval_days: "14 days", mixing_compatibility: "Safe for most crops", re_entry_time_hours: "24 hours" }
  }
];

const PRECAUTIONS_UNIVERSAL = [
  "Before spraying: read label and follow dosage (never increase); check weather (no wind/rain/peak heat); confirm crop and disease match.",
  "Personal safety: wear mask, gloves, full-sleeve clothes; no eating/drinking/smoking while spraying; keep children and animals away.",
  "During/after: spray morning or evening; wash hands and clothes after; store locked away from children; never reuse containers for food/water.",
  "Safety interval: respect pre-harvest interval; do not mix chemicals unless label says safe."
];

// Export for vanilla JS browser environment
window.KisaanData = {
  DISEASES,
  DISEASE_TO_INGREDIENT,
  PRODUCTS,
  PRECAUTIONS_UNIVERSAL
};