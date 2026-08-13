# Gold-Standard Specialty Coffee Directive & Verification SOP

## Purpose
Maintain the definitive, gold-standard reference list for Specialty Coffee establishments in Stockholm. Ensure that any incoming dataset (OpenStreetMap, D1, or manual entries) is normalized, verified, and scored according to strict specialty coffee verification rules.

---

## ☕ Curated Gold-Standard Stockholm Specialty Coffee Reference List

| Name | Area / Neighborhood | Street Address | Verification & Roastery Notes |
| :--- | :--- | :--- | :--- |
| **Solkant, Café & Roastery** | Kungsholmen | Pipersgatan 24 | Micro-roastery, single origin, V60 & Kalita Wave |
| **Drop Coffee** | Mariatorget / Södermalm | Wollmar Yxkullsgatan 10 | Independent roastery, light roasts, traceable coffees |
| **Johan & Nyström** | Mariatorget / Södermalm | Swedenborgsgatan 7 | Specialty coffee roaster pioneer, extensive brew bar |
| **Volca Coffee Roaster** | Kungsholmen | Hantverkargatan 8 | Dedicated brew bar & roastery, bean sales |
| **Pascal Café & Bakery** | Södermalm | Skånegatan 76 | Specialty espresso, single origin pour-overs, fresh cardamom buns |
| **Pascal Kaffebar** | Östermalm | Sturegatan 8 | Precision single origin hand brew & viennoiserie |
| **Pascal Café** | Vasastan | Norrtullsgatan 4 | Acclaimed coffee-led cafe, guest roasters & batch brew |
| **Café Blom** | Skeppsholmen | Exercisplan 2a | Skeppsholmen island specialty coffee & garden seating |
| **Lykke** | Södermalm | Nytorgsgatan 38 | Direct-farm roastery, Nytorget brew bar |
| **Höga Kusten Kaffe Rosteri** | Kungsholmen | Fleminggatan 53 | Northern Swedish roasted beans & precision filter brew |
| **Gast** | Vasastan | Rådmansgatan 57 | Curated guest roaster showcase, filter & espresso |
| **Muttley & Jack's Coffee Roasters** | Södermalm | Barnängsgatan 13 | Award-winning specialty micro-lot roastery |
| **Nordic Brew Lab Stockholm** | Vasastan | Torsgatan 46 | Experimental Nordic roast profiles & pour-over lab |
| **A.B.Café** | Hägersten | Valborgsmässovägen 34 | Independent Telefonplan specialty cafe & homemade baking |
| **Standout Coffee** | Östermalm / Frihamnen | Frihamnsgatan 23 | Competition coffees, rare varieties & subscription roasts |

---

## 🛡️ Verification & Normalization SOP

### 1. Mandatory Promotion Rule
Whenever an establishment matches any pattern in the reference list above (e.g. `pascal`, `drop coffee`, `johan & nyström`, `solkant`, `volca`, `lykke`, `gast`, `standout`, `muttley`, `nordic brew lab`, `a.b.café`, `höga kusten`, `café blom`) or contains `roastery`, `roaster`, or `rosteri` in its title:
- **`kind` / `establishment_type`** MUST be assigned to `"Specialty coffee"`.
- **`specialtyVerified`** MUST be set to `true`.
- **Tags** MUST include `"Specialty coffee"`, `"Filter"`, `"Single origin"`, and `"Own roastery"` (if roaster).
- **CRITICAL**: Never use loose 5-letter substring `johan` for matching, as it causes false positive matches on unrelated places like *Johannesfredsgrillen*. Always match the full brand name `johan & nyström` or `johan och nyström`.

### 2. Negative Restaurant, Grill & Gastropub Override Rule
Any venue whose name, category, or cuisine contains keywords like `grill`, `grillen`, `gastropub`, `pub`, `bar`, `restaurang`, `restaurant`, `burger`, `pizza`, `kebab`, `sushi`, `steakhouse`, `taverna`, or `sportsbar` (e.g. *Johannesfredsgrillen*, *Emils Gastropub & Restaurang*) MUST be classified as `"Restaurant"` and is strictly prohibited from being categorized as `"Specialty coffee"` or `"Bakery"`.

### 3. Commercial Chain Purge & Exclusion Rule
Commercial retail coffee chains and mass-market pod stores are strictly barred from receiving specialty coffee classification or being recommended:
- **Excluded**: `Nespresso`, `Kahls` / `Kahls The & Kaffehandel`, `Wayne's Coffee`, `Espresso House`, `Starbucks`, `Bönor & Blad`, `Pressbyrån`, `7-Eleven`.
- Commercial chains receive a `-9999` score penalty in RAG retrieval and are filtered out of map/list views.
