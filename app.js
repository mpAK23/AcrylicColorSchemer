// State
let allPaintsData = { open: [], heavy_body: [] };
let paints = [];
let ownedPaints = new Set();
let baseColor = null;
let currentHarmony = 'complementary';

// DOM Elements
const paintsGrid = document.getElementById('paintsGrid');
const searchInput = document.getElementById('searchInput');
const showOwnedOnly = document.getElementById('showOwnedOnly');
const seriesSelect = document.getElementById('seriesSelect');
const harmonyBtns = document.querySelectorAll('.harmony-btn');
const schemeWrapper = document.getElementById('schemeWrapper');
const exportBtn = document.getElementById('exportBtn');
const lightnessSlider = document.getElementById('lightnessSlider');
const lightnessValue = document.getElementById('lightnessValue');

// Load saved paints from localStorage
const savedPaints = localStorage.getItem('ownedPaints');
if (savedPaints) {
    try {
        ownedPaints = new Set(JSON.parse(savedPaints));
    } catch(e) {
        console.error("Could not parse saved paints");
    }
}

// Math Utilities
function lab2lch(l, a, b) {
    let c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    return { l, c, h };
}

function lch2lab(l, c, h) {
    let hr = h * (Math.PI / 180);
    let a = Math.cos(hr) * c;
    let b = Math.sin(hr) * c;
    return { L: l, a, b };
}

function deltaE(lab1, lab2) {
    let dL = lab1.L - lab2.L;
    let da = lab1.a - lab2.a;
    let db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
}

function lab2rgb(l, a, b) {
    let y = (l + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;
    x = 0.95047 * (x * x * x > 0.008856 ? x * x * x : (x - 16 / 116) / 7.787);
    y = 1.00000 * (y * y * y > 0.008856 ? y * y * y : (y - 16 / 116) / 7.787);
    z = 1.08883 * (z * z * z > 0.008856 ? z * z * z : (z - 16 / 116) / 7.787);
    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let b_ = x * 0.0557 + y * -0.2040 + z * 1.0570;
    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
    b_ = b_ > 0.0031308 ? 1.055 * Math.pow(b_, 1 / 2.4) - 0.055 : 12.92 * b_;
    return [
        Math.max(0, Math.min(255, Math.round(r * 255))),
        Math.max(0, Math.min(255, Math.round(g * 255))),
        Math.max(0, Math.min(255, Math.round(b_ * 255)))
    ];
}

function rgbToHex(r, g, b) {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

function findClosestPaint(targetLab, excludes = []) {
    let closest = null;
    let minDistance = Infinity;
    
    for (const paint of paints) {
        if (excludes.includes(paint.name)) continue;
        let d = deltaE(targetLab, paint.lab);
        if (d < minDistance) {
            minDistance = d;
            closest = paint;
        }
    }
    return closest;
}

// Initialization
async function init() {
    try {
        const response = await fetch('paints_data.json');
        allPaintsData = await response.json();
        paints = allPaintsData[seriesSelect.value];
        renderPaints(paints);
    } catch (e) {
        console.error("Failed to load paints:", e);
    }
}

// Series selection
seriesSelect.addEventListener('change', (e) => {
    paints = allPaintsData[e.target.value];
    baseColor = null;
    schemeWrapper.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-palette"></i>
            <h2>No Base Color Selected</h2>
            <p>Select a color from the left panel to generate a harmony.</p>
        </div>
    `;
    searchInput.value = '';
    showOwnedOnly.checked = false;
    applyFilters();
});

// Central Filter Function
function applyFilters() {
    const q = searchInput.value.toLowerCase();
    const onlyOwned = showOwnedOnly.checked;
    
    const filtered = paints.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(q) || p.pigment.toLowerCase().includes(q);
        const matchOwned = onlyOwned ? ownedPaints.has(p.name) : true;
        return matchSearch && matchOwned;
    });
    
    renderPaints(filtered);
}

// Search and Filter Listeners
searchInput.addEventListener('input', applyFilters);
showOwnedOnly.addEventListener('change', applyFilters);

// Render Paints List
function renderPaints(paintList) {
    paintsGrid.innerHTML = '';
    paintList.forEach(paint => {
        const item = document.createElement('div');
        item.className = `paint-item ${baseColor && baseColor.name === paint.name ? 'selected' : ''}`;
        
        // Dynamically choose text color for contrast based on L* value
        const textColor = paint.lab.L > 55 ? '#000000' : '#ffffff';
        item.style.backgroundColor = paint.hex;
        item.style.color = textColor;
        
        const isOwned = ownedPaints.has(paint.name);
        
        item.innerHTML = `
            <div class="paint-name">${paint.name}</div>
            <div class="paint-pigment">${paint.pigment}</div>
            <div class="owned-checkbox ${isOwned ? 'checked' : ''}" title="Mark as Owned" style="border-color: ${textColor}">
                <i class="fa fa-check" style="color: ${textColor}"></i>
            </div>
        `;
        
        // Handle select as base color
        item.addEventListener('click', (e) => {
            if(e.target.closest('.owned-checkbox')) return;
            baseColor = paint;
            renderPaints(paints); // re-render to update selected state
            generateScheme();
        });
        
        // Handle marking as owned
        const checkbox = item.querySelector('.owned-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ownedPaints.has(paint.name)) {
                ownedPaints.delete(paint.name);
                checkbox.classList.remove('checked');
            } else {
                ownedPaints.add(paint.name);
                checkbox.classList.add('checked');
            }
            // Save to LocalStorage
            localStorage.setItem('ownedPaints', JSON.stringify([...ownedPaints]));
            
            if(baseColor) generateScheme(); // Re-render if badge is needed
        });
        
        paintsGrid.appendChild(item);
    });
}

// End of renderPaints


// Lightness Slider
lightnessSlider.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    lightnessValue.textContent = val > 0 ? '+' + val : val;
    if (baseColor) generateScheme();
});

// Harmony Control
harmonyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        harmonyBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentHarmony = e.target.dataset.harmony;
        if (baseColor) generateScheme();
    });
});

// Generate Scheme
function generateScheme() {
    if (!baseColor) return;
    
    const lch = lab2lch(baseColor.lab.L, baseColor.lab.a, baseColor.lab.b);
    let lOffset = parseInt(lightnessSlider.value);
    
    let schemeColors = [];
    
    // The base color also needs to be tinted if the slider is moved
    let displayBaseColor = baseColor;
    if (lOffset !== 0) {
        displayBaseColor = JSON.parse(JSON.stringify(baseColor));
        displayBaseColor.lab.L = Math.max(0, Math.min(100, displayBaseColor.lab.L + lOffset));
        let rgb = lab2rgb(displayBaseColor.lab.L, displayBaseColor.lab.a, displayBaseColor.lab.b);
        displayBaseColor.rgb = rgb;
        displayBaseColor.hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
        let mixLabel = lOffset > 0 ? `+ White` : `+ Black`;
        displayBaseColor.name = `${displayBaseColor.name} ${mixLabel}`;
    }
    
    schemeColors.push({
        role: 'Base Color',
        paint: displayBaseColor
    });
    
    const excludes = [baseColor.name];
    
    function addColor(hOffset, roleName, lShift = 0) {
        let newH = (lch.h + hOffset) % 360;
        if(newH < 0) newH += 360;
        
        // Find the closest paint strictly based on the theoretical harmony hue and original lightness
        let targetLab = lch2lab(lch.l, lch.c, newH);
        let closest = findClosestPaint(targetLab, excludes);
        
        if(closest) {
            excludes.push(closest.name); // prevent duplicates
            
            // Now, apply the lightness shift (from slider or monochromatic) to this specific paint's LAB
            let totalShift = lOffset + lShift;
            
            if (totalShift !== 0) {
                // Clone the paint object so we don't mutate the original database
                let tintedPaint = JSON.parse(JSON.stringify(closest));
                
                // Apply shift to lightness, clamping 0-100
                tintedPaint.lab.L = Math.max(0, Math.min(100, tintedPaint.lab.L + totalShift));
                
                // Convert new LAB back to RGB/HEX
                let rgb = lab2rgb(tintedPaint.lab.L, tintedPaint.lab.a, tintedPaint.lab.b);
                tintedPaint.rgb = rgb;
                tintedPaint.hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
                
                // Update name to indicate it was mixed
                let mixLabel = totalShift > 0 ? `+ White` : `+ Black`;
                tintedPaint.name = `${tintedPaint.name} ${mixLabel}`;
                
                schemeColors.push({ role: roleName, paint: tintedPaint });
            } else {
                schemeColors.push({ role: roleName, paint: closest });
            }
        }
    }
    
    if (currentHarmony === 'complementary') {
        addColor(180, 'Complement');
    } 
    else if (currentHarmony === 'split') {
        addColor(150, 'Split Complement 1');
        addColor(210, 'Split Complement 2');
    }
    else if (currentHarmony === 'triadic') {
        addColor(120, 'Triad 1');
        addColor(240, 'Triad 2');
    }
    else if (currentHarmony === 'analogous') {
        addColor(30, 'Analogous 1');
        addColor(-30, 'Analogous 2');
    }
    else if (currentHarmony === 'square') {
        addColor(90, 'Square 1');
        addColor(180, 'Square 2');
        addColor(270, 'Square 3');
    }
    else if (currentHarmony === 'pentadic') {
        addColor(72, 'Pentad 1');
        addColor(144, 'Pentad 2');
        addColor(216, 'Pentad 3');
        addColor(288, 'Pentad 4');
    }
    else if (currentHarmony === 'hexadic') {
        addColor(60, 'Hexad 1');
        addColor(120, 'Hexad 2');
        addColor(180, 'Hexad 3');
        addColor(240, 'Hexad 4');
        addColor(300, 'Hexad 5');
    }
    else if (currentHarmony === 'monochromatic') {
        addColor(0, 'Tint 2', 30);
        addColor(0, 'Tint 1', 15);
        addColor(0, 'Shade 1', -15);
        addColor(0, 'Shade 2', -30);
    }
    
    renderScheme(schemeColors);
}

// Render Scheme
function renderScheme(schemeColors) {
    const harmonyNames = {
        'complementary': 'Complementary',
        'split': 'Split-Complementary',
        'triadic': 'Triadic',
        'analogous': 'Analogous',
        'square': 'Square',
        'pentadic': 'Pentadic',
        'hexadic': 'Hexadic',
        'monochromatic': 'Monochromatic'
    };
    
    let html = `
        <div class="scheme-container" id="schemeContainerToExport">
            <h2 class="scheme-title"><strong>${baseColor.name}</strong> ${harmonyNames[currentHarmony]} Scheme</h2>
            <div class="palette-row">
    `;
    
    schemeColors.forEach(item => {
        const p = item.paint;
        const isOwned = ownedPaints.has(p.name);
        html += `
            <div class="palette-item">
                <div class="palette-color" style="background-color: ${p.hex}"></div>
                <div class="palette-info">
                    <div class="palette-role">${item.role}</div>
                    <h3>${p.name}</h3>
                    <p>${p.pigment}</p>
                    ${isOwned ? '<div class="palette-owned-badge"><i class="fa fa-check"></i> Owned</div>' : ''}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    schemeWrapper.innerHTML = html;
}

// Export PNG (Native Canvas 2D for 100% flawless export)
exportBtn.addEventListener('click', () => {
    if(!baseColor) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const titleText = document.querySelector('.scheme-title').innerText;
    const items = document.querySelectorAll('.palette-item');
    
    const cols = items.length;
    const itemWidth = 240;
    const itemHeight = 320;
    const padding = 60;
    const gap = 24;
    
    canvas.width = padding * 2 + (itemWidth * cols) + (gap * (cols - 1));
    canvas.height = padding * 2 + 80 + itemHeight; // 80 for title area
    
    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleText, canvas.width / 2, padding + 30);
    
    // Text wrapper helper
    function wrapText(context, text, x, y, maxWidth, lineHeight) {
        let words = text.split(' ');
        let line = '';
        for(let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = context.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                context.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, y);
        return y;
    }
    
    // Draw Items
    items.forEach((item, index) => {
        const x = padding + (itemWidth + gap) * index;
        const y = padding + 80;
        
        // Background card
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, itemWidth, itemHeight);
        
        // Border
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, itemWidth, itemHeight);
        
        // Color block
        const colorBlock = item.querySelector('.palette-color');
        ctx.fillStyle = colorBlock.style.backgroundColor;
        ctx.fillRect(x, y, itemWidth, 180);
        
        // Border line under color block
        ctx.beginPath();
        ctx.moveTo(x, y + 180);
        ctx.lineTo(x + itemWidth, y + 180);
        ctx.stroke();
        
        // Text
        const role = item.querySelector('.palette-role').innerText;
        const name = item.querySelector('h3').innerText;
        const pigment = item.querySelector('p').innerText;
        
        ctx.textAlign = 'left';
        
        // Role
        ctx.fillStyle = '#0ea5e9';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.fillText(role.toUpperCase(), x + 20, y + 215);
        
        // Name
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        let nextY = wrapText(ctx, name, x + 20, y + 245, itemWidth - 40, 24);
        
        // Pigment
        ctx.fillStyle = '#64748b';
        ctx.font = '14px "Segoe UI", sans-serif';
        wrapText(ctx, pigment, x + 20, nextY + 20, itemWidth - 40, 18);
    });
    
    // Download
    const link = document.createElement('a');
    link.download = `${baseColor.name.replace(/\s+/g, '_')}_${currentHarmony}_scheme.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

init();
