let table;
let buildings = [];
let filtered = [];
let latMin=90, latMax=-90, lonMin=180, lonMax=-180;
let scaleFactor = 1;
let offsetX=0, offsetY=0;
let dragging=false, lastMouse;
let canvas;
let boroughSelect, typeSelect, yearSlider, yearLabel, resetViewBtn;
let infoBox;
let minYear=9999, maxYear=0;
let boroughsList = ['All'];
let typesList = ['All'];

function preload(){
  // adjust filename if you renamed the CSV
  table = loadTable('NYC_Building_Energy_and_Water_Data_Disclosure_for_Local_Law_84_(2022-Present)_20251020.csv', 'csv', 'header');
}

function setup(){
  const container = select('#canvasContainer');
  canvas = createCanvas(container.width, container.height);
  canvas.parent('canvasContainer');

  boroughSelect = select('#boroughSelect');
  typeSelect = select('#typeSelect');
  yearSlider = select('#yearSlider');
  yearLabel = select('#yearLabel');
  resetViewBtn = select('#resetView');
  infoBox = select('#infoBox');

  parseTable();
  populateUI();
  applyFilters();

  yearSlider.input(function(){ yearLabel.html(yearSlider.value()); applyFilters(); });
  boroughSelect.changed(applyFilters);
  typeSelect.changed(applyFilters);
  resetViewBtn.mousePressed(function(){ resetView(); });

  resetView();
}

function windowResized(){
  const container = select('#canvasContainer');
  resizeCanvas(container.width, container.height);
  redraw();
}

function parseTable(){
  for (let r=0; r<table.getRowCount(); r++){
    let latRaw = table.getString(r,'Latitude');
    let lonRaw = table.getString(r,'Longitude');

    // skip blanks, "Not Available", or non-numeric values
    if (!latRaw || !lonRaw || latRaw === 'Not Available' || lonRaw === 'Not Available') continue;

    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const b = {
      name: table.getString(r,'Property Name') || '',
      borough: table.getString(r,'Borough') || '',
      type: table.getString(r,'Primary Property Type - Self Selected') ||
            table.getString(r,'Primary Property Type - Portfolio Manager-Calculated') || '',
      year: Number(table.getString(r,'Calendar Year')) || Number(table.getString(r,'Year Ending')) || null,
      eui: Number(table.getString(r,'Weather Normalized Site EUI (kBtu/ft²)')),
      ghg: Number(table.getString(r,'Total (Location-Based) GHG Emissions (Metric Tons CO2e)')),
      lat, lon
    };

    if (!b.year) continue;

    buildings.push(b);
    latMin = min(latMin, lat);
    latMax = max(latMax, lat);
    lonMin = min(lonMin, lon);
    lonMax = max(lonMax, lon);
    minYear = min(minYear, b.year);
    maxYear = max(maxYear, b.year);

    if (b.borough && !boroughsList.includes(b.borough)) boroughsList.push(b.borough);
    if (b.type && !typesList.includes(b.type)) typesList.push(b.type);
  }

  boroughsList.sort();
  typesList.sort();

  if (minYear===9999) { minYear=2018; maxYear=2023; }
}

function populateUI(){
  boroughSelect.html('');
  boroughsList.unshift('All');
  boroughsList = Array.from(new Set(boroughsList));
  boroughsList.forEach(function(b){ boroughSelect.option(b); });

  typeSelect.html('');
  typesList.unshift('All');
  typesList = Array.from(new Set(typesList));
  typesList.forEach(function(t){ typeSelect.option(t); });

  yearSlider.attribute('min', minYear);
  yearSlider.attribute('max', maxYear);
  yearSlider.value(maxYear);
  yearLabel.html(yearSlider.value());

  const legend = select('#legend');
  legend.html('<strong>Legend</strong><br>Color → EUI (kBtu/ft²)<br>Size → Total GHG (Metric Tons CO₂e)');
}

function applyFilters(){
  const borough = boroughSelect.value();
  const propType = typeSelect.value();
  const year = Number(yearSlider.value());
  filtered = buildings.filter(function(b){
    if (borough && borough!=='All' && b.borough!==borough) return false;
    if (propType && propType!=='All' && b.type!==propType) return false;
    if (b.year !== year) return false;
    return true;
  });
}

function draw(){
  background('#071427');
  push();
  translate(width/2 + offsetX, height/2 + offsetY);
  scale(scaleFactor);
  translate(-width/2, -height/2);

  noStroke();
  fill(10,20,30);
  rect(0,0,width,height);

  for (let i=0; i<filtered.length; i++){
    const b = filtered[i];
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const eui = isFinite(b.eui) ? b.eui : 0;
    const ghg = isFinite(b.ghg) ? b.ghg : 0;

    const col = euiToColor(eui);
    const s = ghgToSize(ghg);

    noStroke();
    fill(col);
    ellipse(p.x, p.y, s, s);
  }

  pop();
}

function geoToXY(lat, lon){
  const pad = 40;
  const minX = pad, maxX = width - pad;
  const minY = pad, maxY = height - pad;

  if (lonMin===lonMax || latMin===latMax) return null;
  const x = map(lon, lonMin, lonMax, minX, maxX);
  const y = map(lat, latMax, latMin, minY, maxY);
  return {x,y};
}

function euiToColor(eui){
  const v = constrain(eui, 0, 300);
  const t = map(v, 0, 300, 0, 1);
  const r = lerp(60, 220, t);
  const g = lerp(180, 40, t);
  const b = lerp(200, 30, t);
  return color(r,g,b,220);
}

function ghgToSize(ghg){
  const v = isFinite(ghg) ? ghg : 0;
  const s = map(constrain(v,0,2000), 0, 2000, 4, 36);
  return s;
}

function mouseMoved(){
  for (let i=0; i<filtered.length; i++){
    const b = filtered[i];
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const s = ghgToSize(b.ghg);
    const d = dist(mouseX, mouseY, p.x, p.y);
    if (d < s/2 + 3){
      const tip = document.querySelector('.tooltip') || createTooltip();
      tip.innerHTML = '<strong>' + escapeHtml(b.name) + '</strong><br>' + b.borough + ' — ' + b.type + '<br>Year: ' + b.year + '<br>EUI: ' + (isFinite(b.eui)?b.eui.toFixed(1):'N/A') + ' kBtu/ft²<br>GHG: ' + (isFinite(b.ghg)?b.ghg.toFixed(2):'N/A') + ' tCO₂e';
      tip.style.left = (mouseX + 12) + 'px';
      tip.style.top = (mouseY + 12) + 'px';
      tip.style.display = 'block';
      return;
    }
  }
  hideTooltip();
}

function mouseClicked(){
  for (let i=0; i<filtered.length; i++){
    const b = filtered[i];
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const s = ghgToSize(b.ghg);
    const d = dist(mouseX, mouseY, p.x, p.y);
    if (d < s/2 + 3){
      showInfo(b);
      return;
    }
  }
}

function showInfo(b){
  const html = '<strong>' + escapeHtml(b.name) + '</strong><br>' +
  'Borough: ' + escapeHtml(b.borough) + '<br>' +
  'Type: ' + escapeHtml(b.type) + '<br>' +
  'Year: ' + b.year + '<br>' +
  'Weather Normalized Site EUI: ' + (isFinite(b.eui)?b.eui.toFixed(2):'N/A') + ' kBtu/ft²<br>' +
  'Total (Location-Based) GHG Emissions: ' + (isFinite(b.ghg)?b.ghg.toFixed(2):'N/A') + ' metric tons CO₂e';
  infoBox.html(html);
}

function createTooltip(){
  let t = document.createElement('div');
  t.className = 'tooltip';
  document.body.appendChild(t);
  return t;
}

function hideTooltip(){
  const tip = document.querySelector('.tooltip');
  if (tip) tip.style.display = 'none';
}

function resetView(){
  scaleFactor = 1;
  offsetX = 0;
  offsetY = 0;
}

function mouseWheel(e){
  const s = (e.delta > 0) ? 0.95 : 1.05;
  scaleFactor *= s;
  scaleFactor = constrain(scaleFactor, 0.5, 6);
  return false;
}

function mousePressed(){
  dragging = true;
  lastMouse = {x: mouseX, y: mouseY};
}

function mouseDragged(){
  if (dragging){
    offsetX += mouseX - lastMouse.x;
    offsetY += mouseY - lastMouse.y;
    lastMouse = {x: mouseX, y: mouseY};
  }
}

function mouseReleased(){
  dragging = false;
}

function escapeHtml(str){
  return (str+'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]; });
}