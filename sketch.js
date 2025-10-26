// Energy Pulse p5.js sketch (optimized + zoom/click fix)
const urlParams = new URLSearchParams(window.location.search);
const SELECTED_BOROUGH = urlParams.get('borough')?.toUpperCase() || 'MANHATTAN'; 
let table;
let buildings = [];
let filtered = [];
let latMin=90, latMax=-90, lonMin=180, lonMax=-180;
let scaleFactor = 1;
let offsetX=0, offsetY=0;
let dragging=false, lastMouse;
let canvas;
let typeSelect, yearSlider, yearLabel, resetViewBtn;
let infoBox;
let minYear=9999, maxYear=0;
let typesList = ['All'];

function preload(){
  table = loadTable('NYC_Building_Energy_and_Water_Data_Disclosure_for_Local_Law_84_(2022-Present)_20251020.csv', 'csv', 'header');
}

function setup(){
  const container = select('#canvasContainer');
  canvas = createCanvas(container.width, container.height);
  canvas.parent('canvasContainer');

  typeSelect = select('#typeSelect');
  yearSlider = select('#yearSlider');
  yearLabel = select('#yearLabel');
  resetViewBtn = select('#resetView');
  infoBox = select('#infoBox');

  parseTable();
  populateUI();
  applyFilters();

  yearSlider.input(() => { yearLabel.html(yearSlider.value()); applyFilters(); });
  typeSelect.changed(applyFilters);
  resetViewBtn.mousePressed(() => { resetView(); });

  resetView();
}

function windowResized(){
  const container = select('#canvasContainer');
  resizeCanvas(container.width, container.height);
  redraw();
}

function parseTable(){
  for (let r=0; r<table.getRowCount(); r++){
    const latRaw = table.getString(r,'Latitude');
    const lonRaw = table.getString(r,'Longitude');
    if (!latRaw || !lonRaw || latRaw === 'Not Available' || lonRaw === 'Not Available') continue;

    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const borough = table.getString(r,'Borough') || '';
    if (borough.toUpperCase() !== SELECTED_BOROUGH.toUpperCase()) continue;

    const b = {
      name: table.getString(r,'Property Name') || '',
      borough,
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

    if (b.type && !typesList.includes(b.type)) typesList.push(b.type);
  }

  typesList.sort();
  if (minYear===9999) { minYear=2018; maxYear=2023; }
}

function populateUI(){
  typeSelect.html('');
  typesList.unshift('All');
  typesList = Array.from(new Set(typesList));
  typesList.forEach(t => { typeSelect.option(t); });

  yearSlider.attribute('min', minYear);
  yearSlider.attribute('max', maxYear);
  yearSlider.value(maxYear);
  yearLabel.html(yearSlider.value());

  const legend = select('#legend');
  legend.html('<strong>Legend</strong><br>Color → EUI (kBtu/ft²)<br>Size → Total GHG (Metric Tons CO₂e)<br><em>Borough: ' + SELECTED_BOROUGH + '</em>');
}

function applyFilters(){
  const propType = typeSelect.value();
  const year = Number(yearSlider.value());
  filtered = buildings.filter(b => {
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

  for (let b of filtered){
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const eui = isFinite(b.eui) ? b.eui : 0;
    const ghg = isFinite(b.ghg) ? b.ghg : 0;
    const col = euiToColor(eui);
    const baseSize = ghgToSize(ghg);

    // Decrease dot size as you zoom in
    const s = constrain(baseSize / sqrt(scaleFactor), 2, 50);

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
  return map(constrain(v,0,2000), 0, 2000, 4, 36);
}

// === Helper for converting screen coords to data coords ===
function screenToWorld(x, y){
  const wx = (x - width/2 - offsetX) / scaleFactor + width/2;
  const wy = (y - height/2 - offsetY) / scaleFactor + height/2;
  return {x: wx, y: wy};
}

function mouseMoved(){
  const world = screenToWorld(mouseX, mouseY);

  for (let b of filtered){
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const s = ghgToSize(b.ghg) / sqrt(scaleFactor);
    const d = dist(world.x, world.y, p.x, p.y);
    if (d < s/2 + 3){
      const tip = document.querySelector('.tooltip') || createTooltip();
      tip.innerHTML = '<strong>' + escapeHtml(b.name) + '</strong><br>' +
                      b.type + '<br>Year: ' + b.year +
                      '<br>EUI: ' + (isFinite(b.eui)?b.eui.toFixed(1):'N/A') +
                      ' kBtu/ft²<br>GHG: ' +
                      (isFinite(b.ghg)?b.ghg.toFixed(2):'N/A') + ' tCO₂e';
      tip.style.left = (mouseX + 12) + 'px';
      tip.style.top = (mouseY + 12) + 'px';
      tip.style.display = 'block';
      return;
    }
  }
  hideTooltip();
}

function mouseClicked(){
  const world = screenToWorld(mouseX, mouseY);
  for (let b of filtered){
    const p = geoToXY(b.lat, b.lon);
    if (!p) continue;
    const s = ghgToSize(b.ghg) / sqrt(scaleFactor);
    const d = dist(world.x, world.y, p.x, p.y);
    if (d < s/2 + 3){
      showInfo(b);
      return;
    }
  }
}

function showInfo(b){
  const html = '<strong>' + escapeHtml(b.name) + '</strong><br>' +
  'Type: ' + escapeHtml(b.type) + '<br>' +
  'Year: ' + b.year + '<br>' +
  'EUI: ' + (isFinite(b.eui)?b.eui.toFixed(2):'N/A') + ' kBtu/ft²<br>' +
  'GHG: ' + (isFinite(b.ghg)?b.ghg.toFixed(2):'N/A') + ' tCO₂e';
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
  const zoomFactor = (e.delta > 0) ? 0.95 : 1.05;
  const newScale = constrain(scaleFactor * zoomFactor, 0.5, 6);

  // Compute mouse position in world coordinates before scaling
  const worldX = (mouseX - width/2 - offsetX) / scaleFactor + width/2;
  const worldY = (mouseY - height/2 - offsetY) / scaleFactor + height/2;

  // Apply the scale
  scaleFactor = newScale;

  // Adjust offset so the zoom occurs around the mouse position
  offsetX = mouseX - width/2 - (worldX - width/2) * scaleFactor;
  offsetY = mouseY - height/2 - (worldY - height/2) * scaleFactor;

  return false; // prevent page scroll
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

function mouseReleased(){ dragging = false; }

function escapeHtml(str){
  return (str+'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}
