import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const API = '/api';
const $ = (id) => document.getElementById(id);
const fallbackSpecies = [
  {id:1,nombre:'Maíz',nombre_cientifico:'Zea mays',categoria:'Cereal',tasa_base:.10,capacidad_carga:1200,altura_max_cm:220,biomasa_max_g:460,temp_min:18,temp_max:32,temp_opt:25,agua_opt:78,luz_opt:82,nutrientes_opt:70,co2_opt:450,dias_madurez:105,color_hex:'#69a65f',descripcion:'Cereal de crecimiento rápido, sensible a la disponibilidad de agua durante floración.'},
  {id:2,nombre:'Frijol',nombre_cientifico:'Phaseolus vulgaris',categoria:'Leguminosa',tasa_base:.09,capacidad_carga:900,altura_max_cm:150,biomasa_max_g:260,temp_min:16,temp_max:30,temp_opt:24,agua_opt:72,luz_opt:70,nutrientes_opt:62,co2_opt:430,dias_madurez:75,color_hex:'#70ad74',descripcion:'Leguminosa que fija nitrógeno en simbiosis y responde al estrés hídrico.'},
  {id:3,nombre:'Tomate',nombre_cientifico:'Solanum lycopersicum',categoria:'Hortaliza',tasa_base:.085,capacidad_carga:1000,altura_max_cm:180,biomasa_max_g:390,temp_min:17,temp_max:30,temp_opt:23,agua_opt:75,luz_opt:76,nutrientes_opt:78,co2_opt:450,dias_madurez:90,color_hex:'#4b9b65',descripcion:'Hortaliza cuyo rendimiento depende de la temperatura, el riego y la nutrición.'},
  {id:4,nombre:'Arabidopsis thaliana',nombre_cientifico:'Arabidopsis thaliana',categoria:'Modelo',tasa_base:.12,capacidad_carga:600,altura_max_cm:35,biomasa_max_g:42,temp_min:16,temp_max:27,temp_opt:22,agua_opt:58,luz_opt:66,nutrientes_opt:55,co2_opt:420,dias_madurez:42,color_hex:'#82b96e',descripcion:'Planta modelo ampliamente utilizada en investigación genética vegetal.'},
  {id:5,nombre:'Girasol',nombre_cientifico:'Helianthus annuus',categoria:'Oleaginosa',tasa_base:.095,capacidad_carga:1100,altura_max_cm:210,biomasa_max_g:410,temp_min:18,temp_max:34,temp_opt:26,agua_opt:66,luz_opt:88,nutrientes_opt:68,co2_opt:440,dias_madurez:100,color_hex:'#69a85f',descripcion:'Especie heliotrópica, con demanda elevada de luz y una flor de gran tamaño.'},
  {id:6,nombre:'Lavanda',nombre_cientifico:'Lavandula angustifolia',categoria:'Aromática',tasa_base:.065,capacidad_carga:800,altura_max_cm:85,biomasa_max_g:180,temp_min:12,temp_max:30,temp_opt:21,agua_opt:38,luz_opt:80,nutrientes_opt:45,co2_opt:420,dias_madurez:120,color_hex:'#65986c',descripcion:'Aromática adaptada a suelos drenados y requerimientos moderados de agua.'}
];
const modelLabels = {lineal:'Lineal',exponencial:'Exponencial',logistico:'Logístico (Verhulst)',gompertz:'Gompertz'};
const memoryKey = 'phytolab_practica05_history_v1';
let speciesCatalog = fallbackSpecies;
let apiOnline = false;
let charts = {};
let historyRows = [];
let lastRuns = null;
let activeSimulationDay = 0;
let playbackActive = true;
let runStarted = false;
let playbackSpeed = 4;
let selectedPartObject = null;
let sceneObjects = null;
let appReady = false;

const readNum = (id) => Number($(id).value);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a,b,t) => a + (b-a)*t;
const smooth = (t) => { t = clamp(t,0,1); return t*t*(3-2*t); };

async function requestApi(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `La API respondió ${response.status}`);
  return payload;
}

function setApiStatus(online, message) {
  apiOnline = online;
  const chip = $('apiStatus');
  chip.classList.toggle('online', online);
  chip.classList.toggle('offline', !online);
  chip.innerHTML = `<i></i><span>${escapeHtml(message)}</span>`;
  $('footerDbStatus').textContent = online ? 'API FlightPHP · MySQL conectados' : 'Modo demostración local · API no disponible';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function normalizeSpecies(s) {
  return {
    ...s,
    nombre: s.nombre || s.name || 'Especie',
    nombre_cientifico: s.nombre_cientifico || s.scientific_name || '',
    tasa_base: Number(s.tasa_base ?? s.base_rate ?? .1),
    capacidad_carga: Number(s.capacidad_carga ?? s.carrying_capacity ?? 1000),
    altura_max_cm: Number(s.altura_max_cm ?? s.max_height_cm ?? 180),
    biomasa_max_g: Number(s.biomasa_max_g ?? s.max_biomass_g ?? 300),
    temp_min: Number(s.temp_min ?? s.temp_min_c ?? 15),
    temp_max: Number(s.temp_max ?? s.temp_max_c ?? 32),
    temp_opt: Number(s.temp_opt ?? s.temp_opt_c ?? 24),
    agua_opt: Number(s.agua_opt ?? s.water_opt ?? 70),
    luz_opt: Number(s.luz_opt ?? s.light_opt ?? 75),
    nutrientes_opt: Number(s.nutrientes_opt ?? s.nutrients_opt ?? 65),
    co2_opt: Number(s.co2_opt ?? 430),
    dias_madurez: Number(s.dias_madurez ?? s.maturity_days ?? 90),
    color_hex: s.color_hex || '#6ba56a',
    descripcion: s.descripcion || s.description || 'Especie del catálogo de cultivo.'
  };
}

async function bootstrap() {
  try {
    const health = await requestApi('/health');
    if (health && health.ok && health.database === 'connected') {
      setApiStatus(true, 'API + MySQL conectados');
      const speciesResult = await requestApi('/especies');
      const rows = Array.isArray(speciesResult) ? speciesResult : (speciesResult.data || []);
      if (rows.length) speciesCatalog = rows.map(normalizeSpecies);
    } else {
      setApiStatus(false, 'Modo demostración local');
    }
  } catch (error) {
    console.info('API no disponible; se habilita modo demostración local:', error.message);
    setApiStatus(false, 'Modo demostración local');
  }
  fillSpeciesSelect();
  bindControls();
  initCharts();
  try { await initThreeScene(); }
  catch (error) { console.error(error); $('sceneLoading').textContent = 'No se pudo cargar WebGL. Verifica el navegador y la conexión al CDN de Three.js.'; notify('No se pudo iniciar el visor 3D: ' + error.message, 'error'); }
  await refreshHistory();
  await refreshReports();
  await executeComparison({silent:true});
  appReady = true;
}

function fillSpeciesSelect() {
  const select = $('speciesSelect');
  select.innerHTML = speciesCatalog.map(s => `<option value="${Number(s.id)}">${escapeHtml(s.nombre)}${s.nombre_cientifico ? ` · ${escapeHtml(s.nombre_cientifico)}` : ''}</option>`).join('');
  select.value = String(speciesCatalog[0]?.id ?? 1);
  updateSpeciesNote();
}

function updateSpeciesNote() {
  const sp = selectedSpecies();
  $('speciesNote').textContent = `${sp.categoria || 'Especie'} · Madurez referencial: ${sp.dias_madurez} días. ${sp.descripcion}`;
  $('rateRange').value = clamp(sp.tasa_base, 0.02, 0.2);
  $('rateValue').textContent = Number($('rateRange').value).toFixed(2);
  $('capacityRange').value = clamp(sp.capacidad_carga, 300, 2000);
  $('capacityValue').textContent = String(readNum('capacityRange'));
  $('currentModelBadge').textContent = `Modelo ${modelLabels[$('modelSelect').value]}`;
  $('sceneSpeciesA').textContent = sp.nombre;
  $('sceneSpeciesB').textContent = `${sp.nombre} · alternativa`;
}

function selectedSpecies() {
  return speciesCatalog.find(s => String(s.id) === $('speciesSelect').value) || speciesCatalog[0] || normalizeSpecies(fallbackSpecies[0]);
}

function gatherConfig(which = 'A') {
  const sp = selectedSpecies();
  const isB = which === 'B';
  return {
    scenario: which,
    species: sp,
    species_id: Number(sp.id),
    model: isB ? $('modelBSelect').value : $('modelSelect').value,
    days: readNum('daysRange'),
    rate: readNum('rateRange'),
    K: readNum('capacityRange'),
    playbackSpeed: readNum('playbackRange'),
    environment: {
      light: readNum('lightRange'),
      water: isB ? readNum('waterBRange') : readNum('waterRange'),
      temperature: isB ? readNum('temperatureBRange') : readNum('temperatureRange'),
      nutrients: readNum('nutrientRange'),
      co2: readNum('co2Range'),
      wind: readNum('windRange')/100
    }
  };
}

function environmentalStress(config) {
  const sp = config.species;
  const env = config.environment;
  const deviation = (value, opt, tolerance) => clamp(Math.abs(value-opt) / Math.max(1,tolerance) * 100, 0, 100);
  const water = deviation(env.water, sp.agua_opt, 36);
  const light = deviation(env.light, sp.luz_opt, 38);
  const thermal = deviation(env.temperature, sp.temp_opt, Math.max(8,(sp.temp_max-sp.temp_min)*0.55));
  const nutrition = deviation(env.nutrients, sp.nutrientes_opt, 40);
  const co2 = deviation(env.co2, sp.co2_opt, 320);
  const combined = water*.32 + thermal*.28 + light*.18 + nutrition*.14 + co2*.08;
  return {water:Math.round(water),thermal:Math.round(thermal),light:Math.round(light),nutrition:Math.round(nutrition),co2:Math.round(co2),combined:Math.round(combined)};
}

function growthFraction(day, config, stress) {
  const t = Math.max(0, day);
  const horizon = Math.max(1, config.days);
  const quality = clamp(1 - stress.combined/100*.78, .16, 1);
  const r = Math.max(.005, config.rate * quality);
  let p;
  switch (config.model) {
    case 'lineal':
      p = .015 + .965 * (t/horizon) * quality * clamp(config.rate/.1,.45,1.6);
      break;
    case 'exponencial':
      p = .015 * Math.exp(r * t * .52);
      break;
    case 'gompertz': {
      const t0 = horizon * .34;
      p = .985 * Math.exp(-Math.exp(-r*(t-t0)));
      break;
    }
    case 'logistico':
    default: {
      const n0 = .015;
      const k = .985;
      p = k / (1 + ((k/n0)-1) * Math.exp(-r*t));
      break;
    }
  }
  return clamp(p, .006, .985);
}

function evaluateSimulation(config) {
  const stress = environmentalStress(config);
  const sp = config.species;
  const rate = config.rate;
  const capacity = config.K;
  const maxBiomass = Math.max(5, sp.biomasa_max_g * (capacity / Math.max(1,sp.capacidad_carga)));
  const maxHeight = clamp(sp.altura_max_cm/100, .45, 2.55);
  const maxLeaves = Math.max(10, Math.round(22 + maxHeight*14));
  const maxBranches = Math.max(3, Math.round(4 + maxHeight*2));
  const measurements = [];
  let previousBiomass = null;
  for (let day=0; day<=config.days; day++) {
    const p = growthFraction(day, config, stress);
    const biomass = maxBiomass * Math.pow(p, 1.25) * clamp(1 - stress.nutrition/100*.17 - stress.water/100*.12, .55, 1.05);
    const height = maxHeight * p;
    const leaves = Math.round(maxLeaves * clamp((p-.14)/.82,0,1));
    const branches = Math.round(maxBranches * clamp((p-.11)/.84,0,1));
    const icr = previousBiomass === null ? 0 : ((biomass - previousBiomass) / Math.max(previousBiomass,.05))*100;
    measurements.push({day,height_u:Number(height.toFixed(3)),biomass_g:Number(biomass.toFixed(3)),n_hojas:leaves,n_ramas:branches,icr:Number(clamp(icr,0,999).toFixed(3)),growth_pct:Number((p*100).toFixed(2)),stress_water:stress.water,stress_thermal:stress.thermal,stress_light:stress.light,stress_nutrition:stress.nutrition,stress_co2:stress.co2,stress_total:stress.combined});
    previousBiomass = biomass;
  }
  // Find earliest modeled day over the 92%-of-capacity proxy used as the maturity threshold.
  let harvestDays = null;
  for(let day=0; day<=365; day++) {
    if(growthFraction(day, config, stress) >= .92) { harvestDays = day; break; }
  }
  const final = measurements[measurements.length-1];
  const recommendations = makeDecisions(config, stress, final, harvestDays);
  return {
    scenario:config.scenario, name:`${sp.nombre} · Escenario ${config.scenario}`, species_id:config.species_id,
    species_name:sp.nombre, model:config.model, config, stress, measurements,
    summary:{height_final:final.height_u,biomass_final:final.biomass_g,leaves_final:final.n_hojas,branches_final:final.n_ramas,icr_final:final.icr,stress_total:stress.combined,harvest_days:harvestDays},
    decisions:recommendations
  };
}

function makeDecisions(config, stress, final, harvestDays) {
  const items=[];
  const add=(severity,title,message,recommendation,metric,value,threshold)=>items.push({severity,title,message,recommendation,metric,value,threshold});
  const env=config.environment;
  const sp=config.species;
  if(env.water < sp.agua_opt-18) add('alert','Posible estrés hídrico',`Agua disponible ${env.water}% frente al óptimo de referencia (${sp.agua_opt}%).`,'Aumentar el riego en incrementos moderados y revisar la humedad del sustrato.','agua',env.water,sp.agua_opt-18);
  else if(env.water > sp.agua_opt+20) add('warning','Agua por encima del óptimo',`La disponibilidad hídrica supera el valor de referencia para ${sp.nombre}.`,'Reducir el riego y vigilar el drenaje para disminuir el riesgo de anoxia radicular.','agua',env.water,sp.agua_opt+20);
  else add('good','Riego dentro del rango',`El agua simulada está cerca del óptimo de ${sp.nombre}.`,'Mantener el régimen actual y continuar registrando mediciones.','agua',env.water,sp.agua_opt);
  if(Math.abs(env.temperature-sp.temp_opt)>6) add('alert','Alerta térmica',`La temperatura se desvía ${Math.abs(env.temperature-sp.temp_opt)} °C del óptimo estimado (${sp.temp_opt} °C).`,'Reducir o amortiguar la temperatura y evaluar sombra o ventilación.','temperatura',env.temperature,sp.temp_opt);
  else add('good','Temperatura favorable',`La temperatura está en una zona cercana al óptimo (${sp.temp_opt} °C).`,'Mantener ventilación y monitoreo térmico.','temperatura',env.temperature,sp.temp_opt);
  if(env.light < sp.luz_opt-20) add('warning','Luz limitante',`La luz disponible (${env.light}%) está por debajo de la referencia (${sp.luz_opt}%).`,'Aumentar iluminación o reducir el sombreado.','luz',env.light,sp.luz_opt-20);
  if(env.nutrients < sp.nutrientes_opt-22) add('warning','Nutrientes potencialmente limitantes',`El índice de nutrientes (${env.nutrients}%) está por debajo del óptimo simulado.`,'Revisar disponibilidad nutricional antes de modificar la fertilización.','nutrientes',env.nutrients,sp.nutrientes_opt-22);
  if(harvestDays !== null && harvestDays <= config.days) add('good','Madurez estimada dentro del horizonte',`El modelo alcanza el umbral de madurez alrededor del día ${harvestDays}.`,'Preparar una revisión de madurez; la cosecha real debe confirmarse con observaciones.','madurez',harvestDays,config.days);
  else add('warning','Madurez fuera del horizonte',`No se alcanza el umbral de madurez en ${config.days} días simulados.`,'Ampliar el horizonte o revisar las condiciones y los parámetros del modelo.','madurez',config.days,harvestDays);
  if(stress.combined>=55) add('alert','Estrés compuesto elevado',`Índice compuesto de estrés: ${stress.combined}/100.`,'Priorizar la variable con mayor desviación antes de comparar rendimiento.','estres',stress.combined,55);
  return items;
}

function initCharts() {
  if (!window.Chart) return;
  const common = {responsive:true,maintainAspectRatio:false,animation:{duration:180},plugins:{legend:{display:false},tooltip:{backgroundColor:'#20382b',titleFont:{family:'DM Sans'},bodyFont:{family:'DM Sans'},padding:10}},scales:{x:{grid:{display:false},ticks:{color:'#9aa59a',font:{size:9}},title:{display:true,text:'Día simulado',color:'#97a198',font:{size:9}}},y:{grid:{color:'#edf1e9'},ticks:{color:'#9aa59a',font:{size:9}},beginAtZero:true}}};
  charts.growth = new Chart($('growthChart'),{type:'line',data:{labels:[],datasets:[{label:'Escenario A',data:[],borderColor:'#4d9160',backgroundColor:'rgba(77,145,96,.09)',fill:true,borderWidth:2.3,tension:.33,pointRadius:0},{label:'Escenario B',data:[],borderColor:'#d6a65d',backgroundColor:'rgba(214,166,93,.05)',fill:false,borderWidth:2,tension:.33,pointRadius:0,borderDash:[5,4]}]},options:{...structuredClone(common),scales:{...structuredClone(common.scales),y:{...structuredClone(common.scales.y),title:{display:true,text:'Biomasa estimada (g)',color:'#97a198',font:{size:9}}}}}});
  charts.stress = new Chart($('stressChart'),{type:'bar',data:{labels:['Hídrico','Térmico','Lumínico','Nutricional','CO₂'],datasets:[{label:'A',data:[0,0,0,0,0],backgroundColor:'#69a477',borderRadius:4},{label:'B',data:[0,0,0,0,0],backgroundColor:'#e0b468',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{usePointStyle:true,boxWidth:6,color:'#8c988e',font:{size:9}}}},scales:{x:{grid:{display:false},ticks:{color:'#919d93',font:{size:9}}},y:{min:0,max:100,grid:{color:'#edf1e9'},ticks:{stepSize:25,color:'#919d93',font:{size:9}}}}}});
  charts.efficiency = new Chart($('efficiencyChart'),{type:'bar',data:{labels:[],datasets:[{label:'g/día',data:[],backgroundColor:'#78a982',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},indexAxis:'y',scales:{x:{beginAtZero:true,grid:{color:'#edf1e9'},ticks:{color:'#919d93',font:{size:9}}},y:{grid:{display:false},ticks:{color:'#6e7e71',font:{size:10}}}}}});
}

function makeLeafMaterial(color, phase=0) {
  const shaders = sceneObjects?.shaderSources;
  if (!shaders?.vertex || !shaders?.fragment) throw new Error('No se pudieron cargar los shaders GLSL de las hojas.');
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uWindStrength:{value:.4},uPhase:{value:phase},uLeafColor:{value:new THREE.Color(color)}},
    vertexShader:shaders.vertex,
    fragmentShader:shaders.fragment,
    side:THREE.DoubleSide
  });
}

async function initThreeScene() {
  const [windVertex, windFragment] = await Promise.all([
    fetch('./shaders/wind.vert').then(r => { if(!r.ok) throw new Error('No se pudo leer shaders/wind.vert'); return r.text(); }),
    fetch('./shaders/wind.frag').then(r => { if(!r.ok) throw new Error('No se pudo leer shaders/wind.frag'); return r.text(); })
  ]);
  const container=$('sceneContainer');
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#e5eee0'); scene.fog=new THREE.Fog('#e5eee0',13,24);
  const camera=new THREE.PerspectiveCamera(40,container.clientWidth/Math.max(1,container.clientHeight),.1,100); camera.position.set(0,4.8,8.8);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setSize(container.clientWidth,container.clientHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05; renderer.domElement.setAttribute('aria-label','Comparación 3D de escenarios de crecimiento A y B; selecciona las partes vegetales con el mouse.'); container.prepend(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,1.15,0); controls.enableDamping=true; controls.dampingFactor=.06; controls.minDistance=4.4; controls.maxDistance=15; controls.maxPolarAngle=Math.PI*.48; controls.update();
  scene.add(new THREE.HemisphereLight('#f7fff2','#a7b89e',1.45)); const light=new THREE.DirectionalLight('#fff4df',2.2); light.position.set(-4,8,5); light.castShadow=true; light.shadow.mapSize.set(1024,1024); scene.add(light); const fillLight=new THREE.PointLight('#d8eaff',.45,18); fillLight.position.set(5,4,-4); scene.add(fillLight);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#e5eee0',roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=-.12; ground.receiveShadow=true; scene.add(ground);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.9,4.08,.22,80),new THREE.MeshStandardMaterial({color:'#cbdcc4',roughness:.9})); platform.position.y=-.04; platform.receiveShadow=true; platform.castShadow=true; scene.add(platform);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.82,.045,10,90),new THREE.MeshStandardMaterial({color:'#94b28f',roughness:.8})); ring.rotation.x=Math.PI/2; ring.position.y=.08; scene.add(ring);
  for(let i=0;i<28;i++){const a=i/28*Math.PI*2;const r=3.25+(i%3)*.12;const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.045+(i%4)*.012,0),new THREE.MeshStandardMaterial({color:i%2?'#a7b8a0':'#bdc9b5',roughness:1}));stone.position.set(Math.cos(a)*r,.09,Math.sin(a)*r);stone.rotation.set(a,.4*i,.3);stone.castShadow=true;scene.add(stone);}
  sceneObjects={scene,camera,renderer,controls,light,container,shaderSources:{vertex:windVertex,fragment:windFragment},plants:{A:null,B:null},selectable:[],leafMaterials:[],clock:new THREE.Clock(),lastTick:performance.now(),resetCamera:()=>{camera.position.set(0,4.8,8.8);controls.target.set(0,1.15,0);controls.update();}};
  buildPlants();
  renderer.domElement.addEventListener('pointerdown',onScenePointerDown);
  window.addEventListener('resize',resizeScene);
  $('sceneLoading').hidden=true;
  animateThree();
}

function disposeGroup(group) {
  group.traverse((object) => {
    if (object.geometry?.dispose) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
}

function buildPlants() {
  if(!sceneObjects) return;
  const {scene,plants}=sceneObjects;
  sceneObjects.selectable=[]; sceneObjects.leafMaterials=[]; selectedPartObject=null;
  $('partEmpty').hidden=false; $('partDetails').hidden=true;
  for(const key of ['A','B']){
    const old=plants[key]; if(old){scene.remove(old.potGroup);scene.remove(old.plantGroup);disposeGroup(old.potGroup);disposeGroup(old.plantGroup);}
    const config=lastRuns?.[key]?.config || gatherConfig(key);
    const sp=config.species;
    const x=key==='A'?-1.55:1.55;
    const potGroup=new THREE.Group(); potGroup.position.set(x,0,0); scene.add(potGroup);
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.36,.27,.52,28,1,false),new THREE.MeshStandardMaterial({color:'#b97858',roughness:.85}));pot.position.y=.31;pot.castShadow=true;pot.receiveShadow=true;potGroup.add(pot);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.34,.045,10,40),new THREE.MeshStandardMaterial({color:'#d3916e',roughness:.8}));rim.rotation.x=Math.PI/2;rim.position.y=.565;rim.castShadow=true;potGroup.add(rim);
    const soil=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.035,28),new THREE.MeshStandardMaterial({color:'#594638',roughness:1}));soil.position.y=.565;soil.receiveShadow=true;potGroup.add(soil);
    const plantGroup=new THREE.Group();plantGroup.position.set(x,.59,0);scene.add(plantGroup);
    const organs=new THREE.Group();plantGroup.add(organs);
    const parts=[]; const selectables=[]; const visualHeight=clamp(sp.altura_max_cm/100,.32,2.25); const leafColor=sp.color_hex||'#6ba56a';
    const baseInfo={speciesName:sp.nombre,scenario:key,stress:lastRuns?.[key]?.stress || environmentalStress(config)};
    function addPart(mesh,category,name,description,geometry,contribution,stressType='water'){
      mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.userData.partInfo={...baseInfo,category,name,description,geometry,contribution,stressType,scenario:key,speciesName:sp.nombre};
      organs.add(mesh);parts.push(mesh);selectables.push(mesh);sceneObjects.selectable.push(mesh);
      const finalPosition=mesh.position.clone();const finalScale=mesh.scale.clone();const finalQuaternion=mesh.quaternion.clone();
      let startPoint=null;let direction=null;let length=0;
      if(mesh.userData.segment){length=mesh.userData.segment.length;direction=mesh.userData.segment.direction.clone();startPoint=mesh.userData.segment.start.clone();}
      mesh.userData.growthEntry={mesh,category,finalPosition,finalScale,finalQuaternion,startPoint,direction,length,progress:0,phase:Math.random()*5};
      return mesh;
    }
    const stemLength=visualHeight;
    const plantLabel=`${sp.nombre||''} ${sp.nombre_cientifico||''}`.toLocaleLowerCase('es');
    const isMaize=/ma[ií]z|zea mays/.test(plantLabel);
    const isBean=/frijol|phaseolus vulgaris/.test(plantLabel);
    const isTomato=/tomate|solanum lycopersicum/.test(plantLabel);
    const isSunflower=/girasol|helianthus annuus/.test(plantLabel);
    const isLavender=/lavanda|lavandula/.test(plantLabel);
    const isArabidopsis=/arabidopsis/.test(plantLabel);
    const up=new THREE.Vector3(0,1,0);
    const standard=(color,roughness=.78)=>new THREE.MeshStandardMaterial({color,roughness});

    function addSegment(start,direction,length,topRadius,bottomRadius,category,name,description,contribution,stressType='thermal',color='#598b4f'){
      const dir=direction.clone().normalize();
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(topRadius,bottomRadius,1,10),standard(color,.82));
      mesh.quaternion.setFromUnitVectors(up,dir);
      mesh.position.copy(start).addScaledVector(dir,length/2);
      mesh.scale.y=length;
      mesh.userData.segment={length,direction:dir,start:start.clone()};
      return addPart(mesh,category,name,description,'CylinderGeometry',contribution,stressType);
    }

    function addLeaf(position,scale,rotation,name,description='Realiza fotosíntesis y participa en el intercambio gaseoso.',contribution=2.2){
      const phase=sceneObjects.leafMaterials.length*.73+(key==='B'?1.1:0);
      const material=makeLeafMaterial(leafColor,phase);sceneObjects.leafMaterials.push(material);
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),material);
      mesh.position.copy(position);mesh.scale.set(scale.x,scale.y,scale.z);mesh.rotation.copy(rotation);
      return addPart(mesh,'leaf',name,description,'SphereGeometry (lámina elipsoidal)',contribution,'water');
    }

    function addOrgan(position,scale,rotation,color,category,name,description,geometryLabel='SphereGeometry',contribution=2.0,stressType='light'){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),standard(color,.68));
      mesh.position.copy(position);mesh.scale.set(scale.x,scale.y,scale.z);mesh.rotation.copy(rotation);
      return addPart(mesh,category,name,description,geometryLabel,contribution,stressType);
    }

    if(isMaize){
      // Maíz: tallo recto, hojas largas alternas, panoja superior y mazorcas laterales.
      addSegment(new THREE.Vector3(0,0,0),up,stemLength,.055,.085,'stem','Tallo principal','Tallo robusto que sostiene las hojas y transporta agua y nutrientes.',25,'thermal','#4f8847');
      for(let i=0;i<8;i++){
        const angle=i*2.32;
        const y=stemLength*(.20+i*.082);
        const sign=i%2===0?1:-1;
        const pos=new THREE.Vector3(Math.cos(angle)*.13,y,Math.sin(angle)*.13);
        addLeaf(pos,new THREE.Vector3(.34,.032,.083),new THREE.Euler(0,angle,sign*.22),`Hoja de maíz ${i+1}`,'Lámina foliar alargada que capta luz a lo largo del tallo.',3.0);
      }
      const tasselStart=new THREE.Vector3(0,stemLength*.84,0);
      addSegment(tasselStart,up,stemLength*.145,.012,.025,'flower','Panoja masculina','Inflorescencia apical que produce polen.',5,'light','#648a42');
      for(let i=0;i<7;i++){
        const angle=i*2.399;
        const pos=new THREE.Vector3(Math.cos(angle)*.045,stemLength*(.89+(i%3)*.018),Math.sin(angle)*.045);
        addOrgan(pos,new THREE.Vector3(.027,.075,.027),new THREE.Euler(0,angle,.18*Math.cos(angle)),i%2?'#b3a35b':'#c8b96e','flower',`Espiguilla de la panoja ${i+1}`,'Pequeña estructura de la inflorescencia masculina.','SphereGeometry',.7,'light');
      }
      for(let ear=0;ear<2;ear++){
        const sign=ear===0?1:-1;
        const cobPos=new THREE.Vector3(sign*.19,stemLength*(ear===0?.57:.69),.015);
        addOrgan(cobPos,new THREE.Vector3(.075,.205,.075),new THREE.Euler(0,0,-sign*.53),'#d9b443','fruit',`Mazorca ${ear+1}`,'Inflorescencia femenina desarrollada; los granos se disponen sobre el olote.','SphereGeometry (olote elipsoidal)',5,'water');
        let kernel=0;
        for(let row=0;row<2;row++)for(let j=0;j<5;j++){
          const t=(j-2)*.064;
          const pos=new THREE.Vector3(cobPos.x+sign*t*.42+(row===0?-.026:.026),cobPos.y+t,cobPos.z+.061);
          addOrgan(pos,new THREE.Vector3(.022,.029,.018),new THREE.Euler(.1,0,-sign*.45),row===0?'#efcf60':'#e6bb3f','fruit',`Grano de mazorca ${ear+1}.${++kernel}`,'Grano simulado que contribuye a la biomasa reproductiva.','SphereGeometry',.3,'nutrition');
        }
      }
    } else if(isBean){
      // Frijol: tallo trepador ligeramente sinuoso, hojas trifoliadas, flores discretas y vainas.
      const nodes=[new THREE.Vector3(0,0,0)];
      for(let i=1;i<=5;i++){
        const end=new THREE.Vector3(Math.sin(i*.92)*.075,stemLength*i/5,Math.cos(i*.92)*.045);
        const start=nodes[nodes.length-1];const delta=end.clone().sub(start);const len=delta.length();
        addSegment(start,delta,len,.027,.041,'stem',`Tallo trepador ${i}`,'Tallo flexible que sostiene el follaje y permite el porte trepador.',5,'thermal','#4f884d');
        nodes.push(end);
      }
      for(let i=1;i<=4;i++){
        const start=nodes[i];const angle=i*2.18;const dir=new THREE.Vector3(Math.cos(angle)*.78,.34,Math.sin(angle)*.78).normalize();const len=stemLength*.17;
        addSegment(start,dir,len,.017,.028,'branch',`Rama lateral ${i}`,'Rama secundaria que sostiene hojas trifoliadas y vainas.',5,'nutrition','#5a9652');
      }
      let leafNum=0;
      for(let i=1;i<nodes.length;i++){
        const node=nodes[i];const baseAngle=i*2.18;
        for(let j=0;j<3;j++){
          const offset=j-1;const angle=baseAngle+offset*.88;
          const pos=node.clone().add(new THREE.Vector3(Math.cos(angle)*.105,.035+(j===1?.025:0),Math.sin(angle)*.105));
          const tilt=offset===0?.05:offset*.28;
          addLeaf(pos,new THREE.Vector3(.135,.038,.092),new THREE.Euler(.03,angle,tilt),`Foliolo de frijol ${++leafNum}`,'Cada hoja del frijol suele estar formada por tres foliolos que captan luz.',2.2);
        }
      }
      for(let i=0;i<3;i++){
        const y=stemLength*(.52+i*.105);const sign=i%2===0?1:-1;
        const pos=new THREE.Vector3(sign*(.12+(i%2)*.035),y,.07);
        addOrgan(pos,new THREE.Vector3(.043,.19,.039),new THREE.Euler(.03,0,-sign*.58),'#4e984d','fruit',`Vaina de frijol ${i+1}`,'Vaina alargada que contiene las semillas de la leguminosa.','SphereGeometry (vaina elipsoidal)',4,'water');
        // Semillas sugeridas en la superficie frontal de cada vaina.
        for(let seed=0;seed<4;seed++){
          const seedPos=new THREE.Vector3(pos.x+sign*(seed-1.5)*.014,pos.y+(seed-1.5)*.067,pos.z+.038);
          addOrgan(seedPos,new THREE.Vector3(.012,.018,.009),new THREE.Euler(0,0,-sign*.58),'#9fbe70','fruit',`Semilla visible ${i+1}.${seed+1}`,'Representación esquemática de una semilla dentro de la vaina.', 'SphereGeometry',.25,'nutrition');
        }
      }
      for(let i=0;i<3;i++){
        const angle=i*2.1;const center=new THREE.Vector3(Math.cos(angle)*.075,stemLength*(.81+i*.035),Math.sin(angle)*.055+.02);
        for(let petal=0;petal<5;petal++){
          const a=petal/5*Math.PI*2;
          addOrgan(center.clone().add(new THREE.Vector3(Math.cos(a)*.027,Math.sin(a)*.02,Math.sin(a)*.027)),new THREE.Vector3(.025,.016,.02),new THREE.Euler(0,a,0),'#f1dfd2','flower',`Pétalo de flor de frijol ${i+1}.${petal+1}`,'Flor pequeña de la leguminosa; se muestra como elemento reproductivo.', 'SphereGeometry',.25,'light');
        }
        addOrgan(center,new THREE.Vector3(.018,.018,.018),new THREE.Euler(),'#dfc56a','flower',`Centro de flor de frijol ${i+1}`,'Centro reproductivo de la flor.','SphereGeometry',.2,'light');
      }
    } else if(isArabidopsis){
      // Arabidopsis thaliana: roseta basal de hojas espatuladas y varios tallos florales finos.
      // La especie es pequeña; su silueta se mantiene baja salvo por los escapos florales.
      const rosetteCount=10;
      for(let i=0;i<rosetteCount;i++){
        const angle=i*2.399;
        const radius=.035+(i%3)*.012;
        const pos=new THREE.Vector3(Math.cos(angle)*radius,.035+(i%2)*.008,Math.sin(angle)*radius);
        const length=.105+(i%3)*.012;
        addLeaf(pos,new THREE.Vector3(length,.022,.052),new THREE.Euler(.02,angle,(i%2?-.10:.10)),`Hoja de roseta ${i+1}`,
          'Hoja basal ancha de Arabidopsis; la roseta concentra gran parte de la superficie fotosintética vegetativa.',2.0);
      }
      for(let stalk=0;stalk<3;stalk++){
        const angle=stalk*Math.PI*2/3+.3;
        const base=new THREE.Vector3(Math.cos(angle)*.018,.025,Math.sin(angle)*.018);
        const direction=new THREE.Vector3(Math.cos(angle)*.12,1,Math.sin(angle)*.12).normalize();
        const length=stemLength*(.85+(stalk%2)*.12);
        addSegment(base,direction,length,.008,.015,'stem',`Escapo floral ${stalk+1}`,
          'Tallo floral fino que eleva las flores por encima de la roseta basal.',7,'thermal','#638e4c');
        for(let flower=0;flower<5;flower++){
          const t=.48+flower*.105;
          const center=base.clone().addScaledVector(direction,length*t);
          const side=(flower%2?1:-1);
          // Cuatro pétalos blancos en cruz, rasgo reconocible de la flor de Arabidopsis.
          for(let petal=0;petal<4;petal++){
            const a=petal*Math.PI/2+Math.PI/4;
            const pos=center.clone().add(new THREE.Vector3(Math.cos(a)*.018,Math.sin(a)*.004,Math.sin(a)*.018));
            addOrgan(pos,new THREE.Vector3(.021,.009,.012),new THREE.Euler(0,a,side*.08),'#f7f5e9','flower',
              `Pétalo blanco ${stalk+1}.${flower+1}.${petal+1}`,
              'Uno de los cuatro pétalos pequeños de la flor de Arabidopsis thaliana.','SphereGeometry (pétalo elipsoidal)',.18,'light');
          }
          addOrgan(center,new THREE.Vector3(.008,.008,.008),new THREE.Euler(),'#e7c94d','flower',
            `Centro floral ${stalk+1}.${flower+1}`,'Centro reproductivo amarillo de una flor pequeña.','SphereGeometry',.12,'light');
          if(flower>=2){
            const siliquePos=center.clone().add(new THREE.Vector3(side*.027,-.025,.006));
            addOrgan(siliquePos,new THREE.Vector3(.009,.055,.009),new THREE.Euler(0,0,-side*.22),'#65934b','fruit',
              `Silicua ${stalk+1}.${flower-1}`,'Fruto alargado tipo silicua que contiene las semillas de Arabidopsis.','SphereGeometry (silicua alargada)',.3,'nutrition');
          }
        }
      }
    } else if(isTomato){
      // Tomate: hábito ramificado, hojas compuestas con foliolos, flores amarillas pequeñas y frutos rojos.
      addSegment(new THREE.Vector3(0,0,0),up,stemLength,.045,.075,'stem','Tallo principal del tomate',
        'Tallo principal ramificado que sostiene hojas compuestas, flores y frutos.',22,'thermal','#4d8248');
      const branchTips=[];
      for(let i=0;i<5;i++){
        const angle=i*2.399+.25;
        const fraction=.27+i*.115;
        const start=new THREE.Vector3(0,stemLength*fraction,0);
        const direction=new THREE.Vector3(Math.cos(angle)*.82,.38+(i%2)*.12,Math.sin(angle)*.82).normalize();
        const length=stemLength*(.22+(i%3)*.025);
        const end=start.clone().addScaledVector(direction,length);
        addSegment(start,direction,length,.017,.032,'branch',`Rama productiva ${i+1}`,
          'Rama lateral del tomate que porta hojas compuestas y estructuras reproductivas.',7,'nutrition','#568b49');
        branchTips.push({start,end,direction,angle,fraction});
        // Foliolos dispuestos a ambos lados de un raquis imaginario para una silueta compuesta.
        for(let k=0;k<4;k++){
          const t=.22+k*.19;
          const anchor=start.clone().addScaledVector(direction,length*t);
          for(const side of [-1,1]){
            const leafAngle=angle+side*(.42+(k%2)*.12);
            const pos=anchor.clone().add(new THREE.Vector3(Math.cos(leafAngle)*(.075+k*.009),.025+(k%2)*.012,Math.sin(leafAngle)*(.075+k*.009)));
            const scale=new THREE.Vector3(.075+(k%2)*.018,.021,.035+(k%3)*.004);
            addLeaf(pos,scale,new THREE.Euler(.08,leafAngle,side*.22),`Foliolo de tomate ${i+1}.${k+1}.${side===1?'a':'b'}`,
              'Foliolo de hoja compuesta; capta luz y contribuye al balance de carbono de la planta.',1.05);
          }
        }
        const terminalLeaf=end.clone().add(new THREE.Vector3(Math.cos(angle)*.035,.035,Math.sin(angle)*.035));
        addLeaf(terminalLeaf,new THREE.Vector3(.105,.024,.043),new THREE.Euler(.08,angle,.12),`Foliolo terminal ${i+1}`,
          'Foliolo terminal de la hoja compuesta del tomate.',1.4);
      }
      // Pequeñas flores amarillas en pedúnculos separados; no hay una cabeza floral grande como en un girasol.
      for(let i=0;i<3;i++){
        const source=branchTips[i*2] || branchTips[i];
        const center=source.end.clone().add(new THREE.Vector3(.025,.045,.018));
        addSegment(source.end,new THREE.Vector3(.2,.85,.1),.075,.004,.009,'branch',`Pedúnculo floral ${i+1}`,
          'Pedúnculo corto que sostiene la flor amarilla del tomate.',.4,'light','#6a934d');
        for(let petal=0;petal<5;petal++){
          const a=petal*Math.PI*2/5;
          const pos=center.clone().add(new THREE.Vector3(Math.cos(a)*.034,Math.sin(a)*.006,Math.sin(a)*.034));
          addOrgan(pos,new THREE.Vector3(.030,.009,.014),new THREE.Euler(0,a,.12),'#f2cf3f','flower',
            `Pétalo amarillo de tomate ${i+1}.${petal+1}`,'Pétalo estrecho de una flor pequeña de tomate.','SphereGeometry (pétalo elipsoidal)',.22,'light');
        }
        addOrgan(center,new THREE.Vector3(.014,.012,.014),new THREE.Euler(),'#e69f2e','flower',
          `Centro de flor de tomate ${i+1}`,'Centro de la flor donde se ubican las estructuras reproductivas.','SphereGeometry',.2,'light');
      }
      // Frutos esféricos de distintos tamaños en niveles laterales, acompañados por sépalos verdes.
      for(let i=0;i<4;i++){
        const angle=i*2.25+.5;
        const fruitPos=new THREE.Vector3(Math.cos(angle)*.19,stemLength*(.37+i*.115),Math.sin(angle)*.15);
        addOrgan(fruitPos,new THREE.Vector3(.073+(i%2)*.012,.073+(i%2)*.012,.073+(i%2)*.012),new THREE.Euler(.05,angle,0),
          i%3===0?'#d64f43':'#df6250','fruit',`Tomate ${i+1}`,
          'Fruto carnoso del tomate; la biomasa reproductiva se representa en el modelo.', 'SphereGeometry (fruto)',3.2,'water');
        for(let sepal=0;sepal<5;sepal++){
          const a=sepal*Math.PI*2/5;
          const pos=fruitPos.clone().add(new THREE.Vector3(Math.cos(a)*.032,.061,Math.sin(a)*.032));
          addLeaf(pos,new THREE.Vector3(.035,.010,.014),new THREE.Euler(.1,a,-.18),`Sépalo del tomate ${i+1}.${sepal+1}`,
            'Sépalo verde del cáliz, situado junto al pedúnculo del fruto.',.18);
        }
      }
    } else if(isSunflower){
      // Girasol: tallo alto, hojas grandes y una única cabeza floral terminal prominente.
      addSegment(new THREE.Vector3(0,0,0),up,stemLength,.05,.082,'stem','Tallo principal del girasol',
        'Tallo erecto que sostiene las hojas y la gran inflorescencia terminal.',24,'thermal','#4f8748');
      for(let i=0;i<7;i++){
        const angle=i*2.4;const y=stemLength*(.2+i*.09);const sign=i%2?1:-1;
        const pos=new THREE.Vector3(Math.cos(angle)*.04,y,Math.sin(angle)*.04);
        addLeaf(pos,new THREE.Vector3(.20,.032,.105),new THREE.Euler(.04,angle,sign*.34),`Hoja de girasol ${i+1}`,
          'Hoja ancha que capta radiación solar para la fotosíntesis.',2.8);
      }
      const headY=stemLength*.96;
      for(let i=0;i<14;i++){
        const angle=i/14*Math.PI*2;const pos=new THREE.Vector3(Math.cos(angle)*.17,headY+.015,Math.sin(angle)*.17);
        addOrgan(pos,new THREE.Vector3(.12,.035,.052),new THREE.Euler(0,-angle,Math.cos(angle)*.12),'#e5b52f','flower',
          `Pétalo del girasol ${i+1}`,'Flor ligulada amarilla que rodea el disco floral del girasol.','SphereGeometry (pétalo alargado)',1.5,'light');
      }
      addOrgan(new THREE.Vector3(0,headY+.025,0),new THREE.Vector3(.125,.105,.125),new THREE.Euler(),'#76502d','flower',
        'Disco floral del girasol','Disco central con numerosas flores pequeñas que producen semillas.','SphereGeometry',3,'light');
      for(let i=0;i<14;i++){
        const angle=i*2.399;const r=.035+(i%4)*.019;
        addOrgan(new THREE.Vector3(Math.cos(angle)*r,headY+.12,Math.sin(angle)*r),new THREE.Vector3(.012,.012,.012),new THREE.Euler(),
          i%2?'#d7a64c':'#c18b35','fruit',`Semilla en formación ${i+1}`,'Aquenio esquemático en el disco floral del girasol.','SphereGeometry',.18,'nutrition');
      }
    } else if(isLavender){
      // Lavanda: mata compacta, hojas estrechas y varias espigas violetas terminales.
      const crownCount=7;
      for(let i=0;i<crownCount;i++){
        const angle=i*2.399;const base=new THREE.Vector3(Math.cos(angle)*.045,0,Math.sin(angle)*.045);
        const direction=new THREE.Vector3(Math.cos(angle)*.22,1,Math.sin(angle)*.22).normalize();
        const length=stemLength*(.65+(i%3)*.07);
        const tip=base.clone().addScaledVector(direction,length);
        addSegment(base,direction,length,.008,.018,'stem',`Tallo de lavanda ${i+1}`,
          'Tallo fino de la mata aromática que sostiene hojas estrechas y una espiga floral.',3,'thermal','#638b4d');
        for(let leaf=0;leaf<5;leaf++){
          const t=.18+leaf*.105;const anchor=base.clone().addScaledVector(direction,length*t);
          for(const side of [-1,1]){
            const leafAngle=angle+side*.85;
            const pos=anchor.clone().add(new THREE.Vector3(Math.cos(leafAngle)*.055,.008,Math.sin(leafAngle)*.055));
            addLeaf(pos,new THREE.Vector3(.075,.012,.018),new THREE.Euler(0,leafAngle,side*.16),
              `Hoja estrecha de lavanda ${i+1}.${leaf+1}.${side===1?'a':'b'}`,'Hoja estrecha aromática de la lavanda.',.65);
          }
        }
        for(let bud=0;bud<6;bud++){
          const t=.58+bud*.055;const center=base.clone().addScaledVector(direction,length*t);
          const side=(bud%2?1:-1);
          addOrgan(center.clone().add(new THREE.Vector3(side*.018,.008,0)),new THREE.Vector3(.022,.035,.022),new THREE.Euler(0,angle,.16),
            '#8971b5','flower',`Flor de lavanda ${i+1}.${bud+1}`,'Pequeña flor violeta agrupada en una espiga terminal.','SphereGeometry',.32,'light');
        }
      }
    } else {
      // Fallback para especies que se agreguen al catálogo sin un constructor dedicado.
      addSegment(new THREE.Vector3(0,0,0),up,stemLength,.04,.07,'stem','Tallo principal',
        'Sostiene el follaje y transporta agua y nutrientes.',20,'thermal','#598b4f');
      for(let i=0;i<5;i++){
        const angle=i*2.399;const y=stemLength*(.25+i*.105);
        const pos=new THREE.Vector3(Math.cos(angle)*.09,y,Math.sin(angle)*.09);
        addLeaf(pos,new THREE.Vector3(.15,.03,.06),new THREE.Euler(.04,angle,.18*(i%2?1:-1)),`Hoja ${i+1}`,
          'Hoja fotosintética de la especie seleccionada.',1.6);
      }
    }
    plants[key]={key,potGroup,plantGroup,organs,parts,selectables,stemLength,config,sp};
  }
  $('sceneSpeciesA').textContent=plants.A.sp.nombre;$('sceneSpeciesB').textContent=`${plants.B.sp.nombre} · B`;
}

function onScenePointerDown(event) {
  if(!sceneObjects) return;
  const rect=sceneObjects.renderer.domElement.getBoundingClientRect();
  const mouse=new THREE.Vector2(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
  const raycaster=new THREE.Raycaster();raycaster.setFromCamera(mouse,sceneObjects.camera);
  const visible=sceneObjects.selectable.filter(mesh=>mesh.visible && mesh.parent && mesh.parent.visible);
  const hits=raycaster.intersectObjects(visible,false);
  if(!hits.length) return;
  selectedPartObject=hits[0].object;showSelectedPart(selectedPartObject);
}

function showSelectedPart(mesh) {
  const info=mesh?.userData.partInfo;if(!info)return;
  $('partEmpty').hidden=true;$('partDetails').hidden=false;
  $('partName').textContent=info.name;$('partSpecies').textContent=info.speciesName;$('partScenario').textContent=`Escenario ${info.scenario}`;$('partGeometry').textContent=info.geometry;
  const run=lastRuns?.[info.scenario];const progress=mesh.userData.growthEntry?.progress ?? 0;const stress=run?.stress || info.stress || {water:0,thermal:0,light:0,nutrition:0};const stressValue=info.stressType==='thermal'?stress.thermal:info.stressType==='light'?stress.light:info.stressType==='nutrition'?stress.nutrition:stress.water;
  const contrib=Number(info.contribution||0);
  $('partGrowth').textContent=`${Math.round(progress*100)}%`;$('partStress').textContent=`${stressValue}/100`;$('partContribution').textContent=`${contrib.toFixed(1)}%`;$('partGrowthFill').style.width=`${progress*100}%`;$('partDescription').textContent=info.description;
}

function updateGrowthInScene() {
  if(!sceneObjects||!lastRuns)return;
  for(const key of ['A','B']){
    const plant=sceneObjects.plants[key];const run=lastRuns[key];if(!plant||!run)continue;
    const dayIndex=Math.min(Math.floor(activeSimulationDay),run.measurements.length-1);const m=run.measurements[dayIndex]||run.measurements[0];const p=clamp(Number(m?.growth_pct||0)/100,.006,.99);
    for(const mesh of plant.parts){
      const e=mesh.userData.growthEntry;if(!e)continue;
      let local;
      if(e.category==='stem')local=smooth((p-.006)/.93);
      else if(e.category==='branch')local=smooth((p-.13)/.82);
      else if(e.category==='leaf')local=smooth((p-.31)/.63);
      else local=smooth((p-.69)/.29);
      e.progress=local;
      if(e.direction&&e.startPoint){const len=e.length*local;mesh.scale.y=Math.max(.0001,len);mesh.position.copy(e.startPoint).addScaledVector(e.direction,len/2);}
      else if(e.category==='stem'){const len=plant.stemLength*local;mesh.scale.set(e.finalScale.x,Math.max(.0001,len),e.finalScale.z);mesh.position.set(0,len/2,0);}
      else {mesh.scale.set(Math.max(.0001,e.finalScale.x*local),Math.max(.0001,e.finalScale.y*local),Math.max(.0001,e.finalScale.z*local));mesh.position.lerpVectors(new THREE.Vector3(0,plant.stemLength*.22,0),e.finalPosition,local);}
      mesh.visible=local>.004;
    }
  }
  if(selectedPartObject)showSelectedPart(selectedPartObject);
}

function animateThree() {
  if(!sceneObjects)return;
  requestAnimationFrame(animateThree);
  const now=performance.now();const delta=Math.min(.06,(now-sceneObjects.lastTick)/1000);sceneObjects.lastTick=now;
  if(playbackActive&&lastRuns&&runStarted){activeSimulationDay+=delta*playbackSpeed;if(activeSimulationDay>=Math.max(lastRuns.A.config.days,lastRuns.B.config.days)){activeSimulationDay=Math.max(lastRuns.A.config.days,lastRuns.B.config.days);playbackActive=false;$('runStatus').textContent='Horizonte completado';$('pauseButton').innerHTML='<span>▶</span> Reanudar reproducción';}}
  const time=now/1000;
  for(const plant of Object.values(sceneObjects.plants)){
    if(!plant)continue;
    const key=plant.key;const cfg=lastRuns?.[key]?.config || plant.config;const windStrength=clamp(Number(cfg.environment?.wind ?? .45),0,1.2);
    plant.organs.rotation.z=Math.sin(time*.75+(key==='A'?0:1.1))*windStrength*.035;
    plant.organs.rotation.x=Math.cos(time*.58+(key==='B'?0:.8))*windStrength*.014;
  }
  sceneObjects.leafMaterials.forEach((mat,i)=>{mat.uniforms.uTime.value=time;mat.uniforms.uWindStrength.value=clamp(readNum('windRange')/100,0,1.2);});
  sceneObjects.controls.update();sceneObjects.renderer.render(sceneObjects.scene,sceneObjects.camera);
  if(lastRuns){const days=Math.max(lastRuns.A.config.days,lastRuns.B.config.days);const current=Math.min(Math.floor(activeSimulationDay),days);if(current!==animateThree.lastDay){animateThree.lastDay=current;updateGrowthInScene();updateKpis();updateGrowthChart();}}
}
animateThree.lastDay=-1;

function resizeScene() { if(!sceneObjects)return;const {container,camera,renderer}=sceneObjects;const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h); }

async function executeComparison({silent=false}={}) {
  const configA=gatherConfig('A');const configB=gatherConfig('B');
  lastRuns={A:evaluateSimulation(configA),B:evaluateSimulation(configB)};activeSimulationDay=0;runStarted=true;playbackActive=true;playbackSpeed=readNum('playbackRange');
  $('runStatus').textContent='Simulación en reproducción';$('pauseButton').innerHTML='<span>Ⅱ</span> Pausar reproducción';$('currentModelBadge').textContent=`A: ${modelLabels[configA.model]} · B: ${modelLabels[configB.model]}`;
  $('sceneDayA').textContent=`Día 0 / ${configA.days}`;$('sceneDayB').textContent=`Día 0 / ${configB.days}`;
  $('sceneProgressText').textContent='Crecimiento: 0%';
  renderDecisions();updateStressChart();
  if(sceneObjects)buildPlants();
  updateGrowthInScene();updateKpis();updateGrowthChart();
  if(!silent)notify('Se calcularon los escenarios A y B con el modelo seleccionado.');
  return lastRuns;
}

function updateKpis() {
  if(!lastRuns)return;const run=lastRuns.A;const day=clamp(Math.floor(activeSimulationDay),0,run.measurements.length-1);const m=run.measurements[day];const p=Number(m.growth_pct)||0;
  $('kpiDay').innerHTML=`${day} <small>/ ${run.config.days}</small>`;$('kpiHeight').innerHTML=`${Number(m.height_u).toFixed(2)} <small>u</small>`;$('kpiBiomass').innerHTML=`${Number(m.biomass_g).toFixed(1)} <small>g</small>`;$('kpiIcr').innerHTML=`${Number(m.icr).toFixed(1)} <small>%/día</small>`;$('kpiLeaves').textContent=String(m.n_hojas);$('kpiBranches').textContent=String(m.n_ramas);$('kpiStress').innerHTML=`${run.stress.combined} <small>/100</small>`;$('kpiAction').textContent=(run.decisions.find(d=>d.severity==='alert')||run.decisions.find(d=>d.severity==='warning')||run.decisions[0])?.title||'Monitorear';
  $('sceneDayA').textContent=`Día ${day} / ${run.config.days}`;$('sceneDayB').textContent=`Día ${Math.min(day,lastRuns.B.config.days)} / ${lastRuns.B.config.days}`;$('sceneProgressText').textContent=`Crecimiento A: ${Math.round(p)}%`;
}

function updateGrowthChart() {
  if(!charts.growth||!lastRuns)return;const day=Math.floor(activeSimulationDay);const maxDay=Math.max(lastRuns.A.config.days,lastRuns.B.config.days);const labels=[];const dataA=[];const dataB=[];
  for(let d=0;d<=Math.min(day,maxDay);d++){labels.push(d);const a=lastRuns.A.measurements[Math.min(d,lastRuns.A.measurements.length-1)];const b=lastRuns.B.measurements[Math.min(d,lastRuns.B.measurements.length-1)];dataA.push(a.biomass_g);dataB.push(b.biomass_g);}
  charts.growth.data.labels=labels.length?labels:[0];charts.growth.data.datasets[0].data=dataA.length?dataA:[0];charts.growth.data.datasets[1].data=dataB.length?dataB:[0];charts.growth.update('none');
}

function updateStressChart() {
  if(!charts.stress||!lastRuns)return;const a=lastRuns.A.stress,b=lastRuns.B.stress;charts.stress.data.datasets[0].data=[a.water,a.thermal,a.light,a.nutrition,a.co2];charts.stress.data.datasets[1].data=[b.water,b.thermal,b.light,b.nutrition,b.co2];charts.stress.update();
}

function renderDecisions() {
  if(!lastRuns)return;const a=lastRuns.A;const b=lastRuns.B;const winner=a.summary.biomass_final>=b.summary.biomass_final?'A':'B';const diff=Math.abs(a.summary.biomass_final-b.summary.biomass_final)/Math.max(a.summary.biomass_final,b.summary.biomass_final,.1)*100;
  let items=[...a.decisions.slice(0,4)];items.push({severity:'good',title:`Comparación A/B · ventaja de ${winner}`,message:`La biomasa simulada final difiere ${diff.toFixed(1)}% entre escenarios (${a.summary.biomass_final.toFixed(1)} g frente a ${b.summary.biomass_final.toFixed(1)} g).`,recommendation:'Interpreta el resultado como una hipótesis de simulación y valida con datos experimentales.'});
  $('decisionList').innerHTML=items.map(item=>`<div class="decision-item ${item.severity==='alert'?'alert':item.severity==='warning'?'warning':''}"><span class="decision-icon">${item.severity==='alert'?'!':item.severity==='warning'?'△':'✓'}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)} ${item.recommendation?escapeHtml(item.recommendation):''}</p></div></div>`).join('');
}

function bindControls() {
  const outputMap={lightRange:['lightValue',v=>`${v}%`],waterRange:['waterValue',v=>`${v}%`],temperatureRange:['temperatureValue',v=>`${v} °C`],nutrientRange:['nutrientValue',v=>`${v}%`],co2Range:['co2Value',v=>`${v} ppm`],rateRange:['rateValue',v=>Number(v).toFixed(2)],capacityRange:['capacityValue',v=>String(v)],daysRange:['daysValue',v=>`${v} días`],playbackRange:['playbackValue',v=>`${v} días/s`],windRange:['windValue',v=>`${v}%`],waterBRange:['waterBValue',v=>`${v}%`],temperatureBRange:['temperatureBValue',v=>`${v} °C`]};
  for(const [id,[out,format]] of Object.entries(outputMap))$(id).addEventListener('input',()=>{$(out).textContent=format($(id).value);if(id==='playbackRange')playbackSpeed=readNum(id);});
  $('speciesSelect').addEventListener('change',()=>{updateSpeciesNote();scheduleRecalculate();});
  for(const id of ['modelSelect','modelBSelect'])$(id).addEventListener('change',()=>{updateSpeciesNote();scheduleRecalculate();});
  for(const id of Object.keys(outputMap))$(id).addEventListener('change',()=>{if(id!=='playbackRange')scheduleRecalculate();});
  $('runButton').addEventListener('click',()=>executeComparison());
  $('pauseButton').addEventListener('click',()=>{playbackActive=!playbackActive;$('pauseButton').innerHTML=playbackActive?'<span>Ⅱ</span> Pausar reproducción':'<span>▶</span> Reanudar reproducción';$('runStatus').textContent=playbackActive?'Simulación en reproducción':'Reproducción pausada';});
  $('resetButton').addEventListener('click',()=>{activeSimulationDay=0;playbackActive=true;runStarted=true;$('pauseButton').innerHTML='<span>Ⅱ</span> Pausar reproducción';$('runStatus').textContent='Crecimiento reiniciado';updateGrowthInScene();updateKpis();updateGrowthChart();notify('El reloj de la simulación regresó al día cero.');});
  $('saveButton').addEventListener('click',saveCurrentRuns);$('csvButton').addEventListener('click',exportCsv);$('pdfButton').addEventListener('click',()=>window.print());
  $('resetCameraButton')?.addEventListener('click',()=>sceneObjects?.resetCamera());
  for(const button of document.querySelectorAll('.nav-item'))button.addEventListener('click',()=>switchView(button.dataset.view));
  $('refreshHistoryButton').addEventListener('click',refreshHistory);$('refreshReportsButton').addEventListener('click',refreshReports);
}
let recalcTimer=null;function scheduleRecalculate(){clearTimeout(recalcTimer);recalcTimer=setTimeout(()=>executeComparison({silent:true}),280);}

function switchView(name) {
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));document.querySelectorAll('.view-panel').forEach(p=>p.classList.toggle('active',p.id===`view-${name}`));
  if(name==='history')refreshHistory();if(name==='reports')refreshReports();if(name==='dashboard')setTimeout(resizeScene,40);
}

function localHistory() { try{return JSON.parse(localStorage.getItem(memoryKey)||'[]');}catch{return [];} }
function persistLocal(run, id) {
  const list=localHistory();const summary=run.summary;const item={id:id||`local-${Date.now()}-${run.scenario}`,local_id:id||`local-${Date.now()}-${run.scenario}`,nombre:run.name,notas:run.notes||'',especie_nombre:run.species_name,especie_id:run.species_id,modelo:run.model,escenario:run.scenario,biomasa_final:summary.biomass_final,altura_final:summary.height_final,estres_total:summary.stress_total,dias_simulados:run.config.days,dias_cosecha_estimados:summary.harvest_days,created_at:new Date().toISOString(),config:serializeConfig(run.config),summary,measurements:run.measurements,stress:run.stress,decisions:run.decisions};
  list.unshift(item);localStorage.setItem(memoryKey,JSON.stringify(list.slice(0,20)));return item;
}
function serializeConfig(config){return {species_id:config.species_id,model:config.model,days:config.days,rate:config.rate,K:config.K,environment:config.environment};}

async function saveCurrentRuns() {
  if(!lastRuns){notify('Primero ejecuta una simulación.','warning');return;}
  const baseName=$('simulationNameInput').value.trim();
  if(!baseName){notify('Escribe un nombre para la simulación antes de guardar.','warning');$('simulationNameInput').focus();return;}
  const userNotes=$('simulationNotesInput').value.trim();
  const saveButton=$('saveButton');saveButton.disabled=true;saveButton.textContent='Guardando...';
  let saved=0;let fellBack=false;
  try {
    for(const key of ['A','B']){
      const run=lastRuns[key];const payload={name:`${baseName} · Escenario ${key}`,notes:`${userNotes}${userNotes?'\n':''}Escenario ${key}; modelo ${modelLabels[run.model]}; horizonte ${run.config.days} días.`,species_id:run.species_id,model:run.model,scenario_label:key,config:serializeConfig(run.config),summary:run.summary,measurements:run.measurements,decisions:run.decisions};
      if(apiOnline){try{await requestApi('/simulaciones',{method:'POST',body:JSON.stringify(payload)});saved++;}catch(error){fellBack=true;persistLocal({...run,name:payload.name,notes:payload.notes});console.warn(error);}}
      else {persistLocal({...run,name:payload.name,notes:payload.notes});saved++;fellBack=true;}
    }
    if(apiOnline && !fellBack)notify('Los dos escenarios se guardaron en MySQL.');
    else notify('Simulación guardada en el historial local. Conecta la API para persistirla en MySQL.','warning');
    await refreshHistory();await refreshReports();
  } catch(error){notify(`No se pudo guardar: ${error.message}`,'error');}
  finally{saveButton.disabled=false;saveButton.textContent='Guardar en MySQL';}
}

async function refreshHistory() {
  let rows=[];
  if(apiOnline){try{const response=await requestApi('/simulaciones?limit=80');rows=Array.isArray(response)?response:(response.data||[]);}catch(error){setApiStatus(false,'Modo demostración local');rows=[];}}
  const local=localHistory();const ids=new Set(rows.map(r=>String(r.id)));for(const r of local)if(!ids.has(String(r.id)))rows.push(r);
  historyRows=rows; $('historyCount').textContent=String(rows.length);$('tableCount').textContent=`${rows.length} registros`;
  const body=$('historyTableBody');
  if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty-cell">No hay simulaciones guardadas todavía. Ejecuta y guarda una corrida para comenzar el historial.</td></tr>';return;}
  body.innerHTML=rows.map((r,i)=>`<tr><td><span class="table-primary">${escapeHtml(r.nombre||r.name||`Simulación ${r.id}`)}</span></td><td>${escapeHtml(r.especie_nombre||r.species_name||'—')}</td><td><span class="model-badge">${escapeHtml(modelLabels[r.modelo||r.model]||r.modelo||r.model||'—')}</span></td><td>${Number(r.biomasa_final??r.summary?.biomass_final??0).toFixed(1)} g</td><td>${Math.round(Number(r.estres_total??r.stress?.combined??0))}/100</td><td>${escapeHtml(formatDate(r.created_at))}</td><td><button class="table-action" data-load-index="${i}">Revisar</button></td></tr>`).join('');
  body.querySelectorAll('[data-load-index]').forEach(btn=>btn.addEventListener('click',()=>loadHistoryRow(rows[Number(btn.dataset.loadIndex)])));
}

function formatDate(value){if(!value)return'—';const d=new Date(value.includes?.(' ')?value.replace(' ','T'):value);return Number.isNaN(d.getTime())?String(value).slice(0,16):d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'});}

async function loadHistoryRow(row) {
  try {
    let detail=row;
    if(apiOnline && row.id && !String(row.id).startsWith('local-'))detail=await requestApi(`/simulaciones/${Number(row.id)}`);
    const m=detail.mediciones||detail.measurements||row.measurements||[];
    if(!m.length){notify('El registro no contiene mediciones visibles para reproducir.','warning');return;}
    const normalized=m.map(x=>({day:Number(x.dia??x.day??0),height_u:Number(x.altura_u??x.height_u??x.altura??0),biomass_g:Number(x.biomasa_g??x.biomass_g??0),n_hojas:Number(x.n_hojas??x.leaves??0),n_ramas:Number(x.n_ramas??x.branches??0),icr:Number(x.icr??0),growth_pct:Number(x.growth_pct??x.progreso_pct??x.growth_percent??0),stress_water:Number(x.estres_hidrico??x.stress_water??0),stress_thermal:Number(x.estres_termico??x.stress_thermal??0),stress_light:Number(x.estres_luminico??x.stress_light??0),stress_nutrition:Number(x.estres_nutricional??x.stress_nutrition??0),stress_co2:Number(x.estres_co2??x.stress_co2??0),stress_total:Number(x.estres_total??x.stress_total??0)}));
    const species=speciesCatalog.find(s=>Number(s.id)===Number(detail.especie_id??detail.species_id))||selectedSpecies();const conf={scenario:'A',species,species_id:Number(species.id),model:detail.modelo||detail.model||'logistico',days:Number(detail.dias_simulados||normalized.length-1),rate:Number(detail.config?.rate||detail.parametros?.rate||.1),K:Number(detail.config?.K||detail.parametros?.K||1000),environment:detail.config?.environment||{light:70,water:70,temperature:24,nutrients:65,co2:430}};const stress=detail.stress||{water:Number(detail.estres_hidrico||0),thermal:Number(detail.estres_termico||0),light:Number(detail.estres_luminico||0),nutrition:Number(detail.estres_nutricional||0),co2:0,combined:Number(detail.estres_total||0)};
    const run={scenario:'A',name:detail.nombre||detail.name,species_id:species.id,species_name:species.nombre,model:conf.model,config:conf,stress,measurements:normalized,summary:{biomass_final:Number(detail.biomasa_final||0),height_final:Number(detail.altura_final||0),leaves_final:Number(detail.hojas_finales||0),branches_final:Number(detail.ramas_finales||0),icr_final:Number(detail.icr_final||0),stress_total:Number(detail.estres_total||0),harvest_days:detail.dias_cosecha_estimados??null},decisions:detail.decisiones||[]};
    const confB={...conf,scenario:'B',model:conf.model};const runB={...run,scenario:'B',name:`${run.name} · réplica`,config:confB,measurements:normalized};lastRuns={A:run,B:runB};activeSimulationDay=0;playbackActive=true;runStarted=true;buildPlants();updateStressChart();renderDecisions();updateGrowthInScene();updateKpis();updateGrowthChart();switchView('dashboard');notify(`Cargada la simulación «${detail.nombre||detail.name||'sin nombre'}».`);
  }catch(error){notify(`No se pudo abrir el registro: ${error.message}`,'error');}
}

async function refreshReports() {
  let report=null;
  if(apiOnline){try{report=await requestApi('/reportes');}catch(error){console.warn('No se pudo cargar el reporte remoto',error);}}
  if(report){renderReports(report);return;}
  const rows=localHistory();const enriched=rows.map(r=>({...r,biomasa_final:Number(r.biomasa_final||0),dias_simulados:Number(r.dias_simulados||1),especie_nombre:r.especie_nombre||r.species_name||'Especie'}));
  const top=[...enriched].sort((a,b)=>b.biomasa_final-a.biomasa_final).slice(0,5);const bySpecies={};for(const r of enriched){const key=r.especie_nombre;const e=r.biomasa_final/Math.max(1,r.dias_simulados);if(!bySpecies[key]||e>bySpecies[key].eficiencia)bySpecies[key]={nombre:key,eficiencia:e,biomasa_final:r.biomasa_final};}
  renderReports({total_simulaciones:rows.length,top_biomasa:top,eficiencia_especies:Object.values(bySpecies).sort((a,b)=>b.eficiencia-a.eficiencia),madurez_promedio:average(rows.map(r=>Number(r.dias_cosecha_estimados)).filter(n=>n>0))});
}
function average(arr){return arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:null;}

function renderReports(report) {
  const top=report.top_biomasa||report.top_biomass||[];const efficiencies=report.eficiencia_especies||report.species_efficiency||[];const total=Number(report.total_simulaciones??report.total??0);const maturity=report.madurez_promedio??report.average_maturity_days;
  $('reportRunCount').textContent=String(total);$('reportTopBiomass').innerHTML=top.length?`${Number(top[0].biomasa_final??top[0].biomass_final??0).toFixed(1)} <small>g</small>`:'—';$('reportTopSpecies').textContent=efficiencies[0]?.nombre||efficiencies[0]?.especie_nombre||'—';$('reportMaturity').innerHTML=maturity!==null&&maturity!==undefined?`${Number(maturity).toFixed(1)} <small>días</small>`:'— <small>días</small>';
  $('topBiomassBody').innerHTML=top.length?top.slice(0,5).map((r,i)=>`<tr><td>${i+1}</td><td><span class="table-primary">${escapeHtml(r.nombre||r.simulacion||`Simulación ${r.id}`)}</span></td><td>${escapeHtml(r.especie_nombre||r.especie||'—')}</td><td>${Number(r.biomasa_final??r.biomass_final??0).toFixed(1)} g</td><td><span class="model-badge">${escapeHtml(modelLabels[r.modelo||r.model]||r.modelo||r.model||'—')}</span></td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">No hay datos suficientes. Guarda simulaciones para crear el ranking.</td></tr>';
  if(charts.efficiency){charts.efficiency.data.labels=efficiencies.slice(0,6).map(e=>e.nombre||e.especie_nombre||'Especie');charts.efficiency.data.datasets[0].data=efficiencies.slice(0,6).map(e=>Number(e.eficiencia??e.biomasa_por_dia??0));charts.efficiency.update();}
  $('reportInterpretation').textContent=total?`El reporte analiza ${total} simulaciones. La especie destacada por eficiencia relativa es ${efficiencies[0]?.nombre||efficiencies[0]?.especie_nombre||'—'}. Usa los rankings para seleccionar hipótesis que después puedas validar con ensayos controlados.`:'No existen corridas persistidas suficientes para el análisis agregado. Ejecuta escenarios A/B y usa «Guardar en MySQL» para llenar el historial.';
}

function exportCsv() {
  if(!lastRuns){notify('Primero ejecuta una simulación.','warning');return;}
  const rows=[['escenario','especie','modelo','dia','altura_u','biomasa_g','hojas','ramas','icr_pct_dia','estres_hidrico','estres_termico','estres_luminico','estres_nutricional','estres_co2','estres_total']];
  for(const key of ['A','B'])for(const m of lastRuns[key].measurements)rows.push([key,lastRuns[key].species_name,lastRuns[key].model,m.day,m.height_u,m.biomass_g,m.n_hojas,m.n_ramas,m.icr,m.stress_water,m.stress_thermal,m.stress_light,m.stress_nutrition,m.stress_co2,m.stress_total]);
  const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');downloadBlob(csv,`phytolab-escenarios-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8;');notify('CSV exportado con las mediciones de A y B.');
}
function downloadBlob(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);}

function notify(message,type='success'){const toast=document.createElement('div');toast.className=`toast ${type==='error'?'error':type==='warning'?'warning':''}`;toast.textContent=message;$('toastContainer').append(toast);setTimeout(()=>toast.remove(),4700);}

bootstrap();
