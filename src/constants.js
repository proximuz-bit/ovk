// Konstanter hämtade från Excel-mallen "OVK protokoll offline.xlsm"

export const SYSTEMTYPER = ["S", "F", "FX", "FT", "FTX", "T"];
export const FLÄKTTYPER = ["F", "T", "C", "FTX"];
export const RESULTAT = [
  { v: "G", label: "G – Godkänd" },
  { v: "EG", label: "EG – Ej godkänd, ombesiktning krävs" },
  { v: "Ej besikt.", label: "Ej besiktigad" },
];
export const UTFALL = [
  { v: "0", label: "0 – Kommentar" },
  { v: "1", label: "1 – Bör åtgärdas innan nästa kontroll" },
  { v: "2", label: "2 – Skall åtgärdas snarast" },
];
export const UPPDRAGSTYPER = ["1:a besiktning", "Återkommande besiktning", "Ombesiktning", "Utökad kontroll", "Egenkontroll"];
export const BYGGNADSKATEGORIER = [
  { v: "smahus", label: "En-/tvåbostadshus" },
  { v: "flerbostadshus", label: "Flerbostadshus" },
  { v: "kontor", label: "Kontor / kontorsbyggnad" },
  { v: "skola_vard", label: "Förskola, skola, vårdlokal eller liknande" },
  { v: "industri_kontor", label: "Kontor/personalutrymme i industribyggnad" },
  { v: "ovrig", label: "Övrig byggnad" },
];
export const MÄTMETODER = [
  "ID1", "ID2", "ID3", "ID4", "ST1", "ST3", "ET1", "ET2", "B1", "Enligt T221998",
];
export const MÄTMETOD_FÖRKLARING = {
  ID1: "Punktvis hastighetsmätning med prandtlrör",
  ID2: "Punktvis hastighetsmätning med varmtrådsanemometer",
  ID3: "Fasta flödesmätdon",
  ID4: "Spårgasmätning",
  ST1: "Mätning av referenstryck",
  ST3: "Mätning med stos, direkt metod",
  ET1: "Tryckfallsmätning",
  ET2: "Mätning med stosförsedd anemometer",
  B1: "Punktvis mätning med varmtrådsanemometer i rektangulärt galler",
  "Enligt T221998": "Enligt T221998",
  ID: "Kanal",
  ET: "Frånluft",
  ST: "Tilluft",
};

// B-formulärets positioner med vägledningstext (från fliken Checklista).
export const POSITIONER = [
  { grupp: "1. Handlingar", pos: [
    ["1.1", "Ritningar", "Behövs för att definiera och systembestämma aggregat och fläkt."],
    ["1.2", "DU-instruktioner", "Bör vara av sådan kvalité att utbildad personal kan sköta, driva och felsöka systemet."],
    ["1.3", "Föregående OVK-protokoll", "Underlättar systembestämning om det är tillgängligt och korrekt."],
    ["1.4", "Proj. värden / luftflödesprotokoll", "Om dessa saknas tillämpas tillämpliga äldre föreskrifter."],
    ["1.5", "Övrigt", "Avvikande/kompletterande underlag samt dispenser."],
  ]},
  { grupp: "2. Föroreningar", pos: [
    ["2.1", "Uteluftskanal", "Föroreningar från intagsgaller till aggregat/fläkt."],
    ["2.2", "Filterdel", "Igensatta filter, filterbyte, vassa kanter som skär sönder filter."],
    ["2.3", "Batterier", "Kontrollera att batterier ej är igensatta eller skadade."],
    ["2.4", "VVX", "Kontrollera att värmeväxlare ej är igensatta av föroreningar."],
    ["2.5", "Fläktdel", "Kontrollera att det är rent."],
    ["2.6", "Kanaler", "Föroreningar efter filterbankar kan tyda på funktionsfel."],
    ["2.7", "Don", "Försmutsade don ger ökat tryckfall – ska vara fria från föroreningar."],
    ["2.8", "Rensningsmöjligheter", "Metoder för att konstatera renhet och rensa; rensluckor."],
    ["2.9", "Fläktrum", "Ska vara rent, endast ventilationsmaterial. Golvbrunnar får ej tillföra avloppslukt."],
    ["2.10", "Övrigt", "Övriga utrymmen och komponenter."],
  ]},
  { grupp: "3. Funktioner", pos: [
    ["3.1", "Filterdel", "Filterramar ska täta mot infästning och luckor."],
    ["3.2", "Batterier", "Kontrolleras i samfunktion med 3.3, 3.4 och 3.5."],
    ["3.3", "VVX", "Kontrolleras i samfunktion med 3.2, 3.4 och 3.5."],
    ["3.4", "Spjäll", "Kontrolleras i samfunktion med 3.2, 3.3 och 3.5."],
    ["3.5", "Styr/Regler/Övervakning", "Kontrolleras i samfunktion med 3.2, 3.3 och 3.4."],
    ["3.6", "Fläktar", "Kontrollera dukstosar/vibrationsdämpare, remmar, remskivor."],
    ["3.7", "Luftflöden", "Flöden kan vara projekterade högre än normerna kräver."],
    ["3.8", "Kanaler", "Skador som påverkar luftflöden och avsedda funktioner."],
    ["3.9", "Don", "Felaktiga don, direktanslutna köks-/WC-fläktar, ventiler."],
    ["3.10", "Övrigt", "T.ex. att brandsäkerhetskrav uppfylls."],
  ]},
  { grupp: "4. Klimat", pos: [
    ["4.1", "Temperatur", "Kontrollera stickprovsvis tilluft- och rumstemperaturer."],
    ["4.2", "Odör", "Odörer från kök, mögel, kemikalier, avlopp, avgaser m.m."],
    ["4.3", "Drag", "Drag från tilluftdon, uteluftdon, fönster m.m."],
    ["4.4", "Ljud", "Störande ljud/buller över gällande normer verifieras med ljudmätning."],
    ["4.5", "Brukarsynpunkter", "En hyresgästenkät kan ge värdefull information."],
    ["4.6", "Övrigt", "Övriga väsentliga iakttagelser."],
  ]},
];

// Möjliga energibesparande åtgärder (fliken Setup, N6:N37).
export const ENERGIÅTGÄRDER = [
  "0. Inga energibesparande åtgärder",
  "1. Veckovis loggning för kartläggning av drift bör genomföras som underlag för åtgärder.",
  "2. Ändrade drifttider.",
  "3. Sänkning av tilluftstemperatur.",
  "4. Minskning av luftflöde genom byte av remskiva eller anpassning via frekvensstyrare.",
  "5. Minskning av luftflöde genom byte av fläktmotor.",
  "6. Behovsstyrning av luftflöde genom installation av hel- och halvfartsmotor.",
  "7. Behovsstyrning av luftflöde genom installation av frekvensomformare.",
  "8. Utbyte av fläktmotor för högre verkningsgrad.",
  "9. Rengöring av värmeåtervinnare och andra aggregatdelar samt kanalsystem inkl. till- och frånluftdon för att nå högre verkningsgrad.",
  "10. Ändring av styr- och regler för värmeåtervinnare för att nå högre årsverkningsgrad, t ex ändrade börvärden för avfrostning.",
  "11. Nattventilation sommartid.",
  "12. Utbyte av styr- och övervakning för energieffektivare drift.",
  "13. Komplettera isolering på kanaldelar i system med luftburen kyla.",
  "14. Byt ut till- och frånluftdon, anslutningslådor, böjar, etc för att uppnå mindre tryckfall.",
  "15. Ändring av vätskeflöde i vätskekopplade värmeåtervinningssystem för att nå högre verkningsgrad.",
  "16. Utbyte av frysskyddstillsatser i värmeåtervinningssystem för att nå högre verkningsgrad.",
  "17. Installation av värmeåtervinning med ventilationsvärmeväxlare.",
  "18. Tätning av läckande kanal- eller aggregatdelar.",
  "19. Tillvaratagande av kondensorvärme från kylmaskin.",
  "20. Utnyttjande av frånluft som tilluft till garage eller annan lokal.",
  "21. Installation av verkningsgradsmätare för värmeåtervinningssystem för kontroll av temperaturverkningsgrad.",
  "22. Installation av flödesmätare, t ex Q-dysa för kontroll av luftflöde.",
  "23. Ändring av felaktiga inställningar.",
  "24. Ta bort fuktare t.ex. i kombination med sänkt rumstemperatur.",
  "25. Ta bort fuktare, minska omfattning genom att installera fuktare i de rum som erfordrar luftfuktning.",
  "26. Injustera kanalsystem enl. proportionalitetsmetoden.",
  "27. Byt ut elbatteri till vattenburet batteri och värmeväxlare.",
  "28. Anpassa luftflöden till gällande verksamhet.",
  "29. Se till att temperaturreglering för ventilation och kyla ej motarbetar varandra.",
  "30. Installera närvarogivare och VAV-spjäll för behovsstyrning.",
  "31. Övrig åtgärd, specificera.",
];

export const NR = [
  "A1 - Byggnad", "A2 - Sammanställning", "A3 - Allmänt omdöme",
  "B - Systemprotokoll", "C - Anmärkning", "D - Åtgärd", "E - Aggregat",
  "K - Klimat", "L - Luftflöde", "Intyg",
];
