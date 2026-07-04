// ============================================================
// CTECH — Firebase-backed app logic (single module file)
// Works the same on mobile and desktop because ALL data now
// lives in Firestore, not in a local JS variable.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, getDoc, setDoc,
  deleteDoc, doc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwK4Z82tLJnbNU89ZvORxGKyFXqk1wZKY",
  authDomain: "ctech-340d8.firebaseapp.com",
  projectId: "ctech-340d8",
  storageBucket: "ctech-340d8.firebasestorage.app",
  messagingSenderId: "725222829347",
  appId: "1:725222829347:web:c1df8c296a765a91aff096"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= CLOUDINARY (image hosting) =================
const CLOUD_NAME = "pkcwvlir";
const UPLOAD_PRESET = "ctechupload";
async function uploadImage(file){
  const data = new FormData();
  data.append("file", file);
  data.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method:"POST", body:data });
  return await res.json();
}

// ============ ICONS ============
var ALL_ICONS=['fa-globe','fa-mobile-alt','fa-chart-bar','fa-microchip','fa-robot','fa-graduation-cap','fa-code','fa-laptop-code','fa-database','fa-server','fa-cloud','fa-wifi','fa-shield-alt','fa-lock','fa-key','fa-bug','fa-terminal','fa-cog','fa-lightbulb','fa-brain','fa-magic','fa-star','fa-fire','fa-bolt','fa-chart-line','fa-chart-pie','fa-dollar-sign','fa-coins','fa-wallet','fa-shopping-cart','fa-store','fa-tags','fa-receipt','fa-credit-card','fa-qrcode','fa-users','fa-user-tie','fa-handshake','fa-comments','fa-headset','fa-phone','fa-envelope','fa-bell','fa-calendar','fa-clock','fa-map-marker-alt','fa-truck','fa-car','fa-bus','fa-plane','fa-industry','fa-factory','fa-building','fa-home','fa-school','fa-hospital','fa-flask','fa-dna','fa-heartbeat','fa-camera','fa-video','fa-music','fa-gamepad','fa-tv','fa-print','fa-file-code','fa-file-alt','fa-folder','fa-download','fa-upload','fa-sync','fa-paint-brush','fa-pen','fa-pencil-alt','fa-cut','fa-crop','fa-image','fa-leaf','fa-sun','fa-moon','fa-snowflake','fa-tint','fa-recycle','fa-wrench','fa-tools','fa-hammer','fa-screwdriver','fa-plug','fa-battery-full','fa-satellite','fa-satellite-dish','fa-signal','fa-broadcast-tower','fa-microphone','fa-box','fa-boxes','fa-warehouse','fa-pallet','fa-barcode','fa-calculator','fa-cash-register','fa-file-invoice','fa-balance-scale','fa-percentage','fa-eye','fa-assistive-listening-systems','fa-blind','fa-wheelchair'];

var selIcon={svc:'fas fa-globe',rp:'fas fa-globe'};
function buildIconGrid(p){var g=document.getElementById(p+'-icon-grid');g.innerHTML=ALL_ICONS.map(function(ic){var f='fas '+ic;return '<div class="icon-opt'+(selIcon[p]===f?' sel':'')+'" onclick="selectIcon(\''+p+'\',\''+f+'\')" title="'+ic+'"><i class="fas '+ic+'"></i></div>';}).join('');}
function filterIcons(p,q){var g=document.getElementById(p+'-icon-grid');var f=q?ALL_ICONS.filter(function(i){return i.includes(q.toLowerCase());}):ALL_ICONS;g.innerHTML=f.map(function(ic){var full='fas '+ic;return '<div class="icon-opt'+(selIcon[p]===full?' sel':'')+'" onclick="selectIcon(\''+p+'\',\''+full+'\')" title="'+ic+'"><i class="fas '+ic+'"></i></div>';}).join('');}
function toggleIconPicker(p){var dd=document.getElementById(p+'-icon-dd');var o=dd.classList.contains('open');document.querySelectorAll('.icon-dropdown').forEach(function(d){d.classList.remove('open');});if(!o){dd.classList.add('open');buildIconGrid(p);}}
function selectIcon(p,f){selIcon[p]=f;document.getElementById(p+'-icon-preview-i').className=f;document.getElementById(p+'-icon-preview-txt').textContent=f;document.getElementById(p+'-icon-dd').classList.remove('open');}
document.addEventListener('click',function(e){if(!e.target.closest('.icon-picker-wrap')){document.querySelectorAll('.icon-dropdown').forEach(function(d){d.classList.remove('open');});}});

// ============ LOCAL CACHE (mirrors Firestore, filled by onSnapshot) ============
var S = {
  services:[], recentProjects:[], projects:[],
  enquiries:[], orders:[],
  banner:{img:null,title:'',sub:'',on:false},
  social:{wa:'',ig:'',tg:'',li:''},
  settings:{user:'admin',pass:'admin123',waNum:'917395984042'}
};
var bannerFile=null, bannerPreviewUrl=null;
var projImgs=[null,null,null];
var activeProj=null;

// DEFAULTS shown on the public site until the admin adds real ones
var DEFAULT_SERVICES=[
  {icon:'fas fa-globe',name:'Website Development',desc:'Professional, responsive websites for businesses, startups, and institutions. Fast, SEO-ready, and visually stunning.'},
  {icon:'fas fa-mobile-alt',name:'Mobile App Development',desc:'Android and iOS apps built for performance. From simple tools to complex platforms.'},
  {icon:'fas fa-chart-bar',name:'Power BI Dashboards',desc:'Turn raw data into actionable insights with beautifully designed Power BI dashboards.'},
  {icon:'fas fa-microchip',name:'IoT Solutions',desc:'Smart connected device systems for colleges, industries, and homes.'},
  {icon:'fas fa-robot',name:'Robotics Projects',desc:'Custom robotics for college final year projects, research labs, and industrial automation.'},
  {icon:'fas fa-graduation-cap',name:'College Tech Projects',desc:'Helping students and institutions with end-to-end project development.'}
];
var DEFAULT_RECENT=[
  {icon:'fas fa-globe',domain:'Web Development',name:'E-Commerce Platform',about:'A full-featured online store with inventory management and payments.'},
  {icon:'fas fa-chart-bar',domain:'Power BI',name:'Sales Analytics Dashboard',about:'Real-time sales KPIs and trends for a regional distribution company.'},
  {icon:'fas fa-robot',domain:'Robotics',name:'Autonomous Line Follower',about:'Award-winning final year robotics project using Arduino and computer vision.'},
  {icon:'fas fa-mobile-alt',domain:'Mobile App',name:'College Attendance App',about:'QR-based attendance tracking deployed across 3 engineering colleges.'},
  {icon:'fas fa-plug',domain:'IoT',name:'Smart Classroom System',about:'IoT-based energy management for college labs and classrooms.'},
  {icon:'fas fa-briefcase',domain:'Web + Dashboard',name:'HR Management Portal',about:'Employee management system with Power BI reporting.'}
];
var DEFAULT_PROJECTS=[
  {id:'d1001',name:'Smart Blind Stick with GPS',domain:'IoT',budget:'4,999',tech:'Arduino, GPS Module, Ultrasonic, Buzzer',desc:'Advanced blind stick with obstacle detection, GPS tracking, and emergency alert. Perfect for final year project.',imgs:[]},
  {id:'d1002',name:'IoT Smart Home Automation',domain:'IoT',budget:'6,499',tech:'ESP8266, Relay, Mobile App, Firebase',desc:'Control home appliances via mobile app with real-time monitoring. Voice control ready.',imgs:[]},
  {id:'d1003',name:'Face Recognition Attendance',domain:'AI + IoT',budget:'7,999',tech:'Python, OpenCV, Raspberry Pi, MySQL',desc:'Automated attendance system using face recognition — no manual entry required.',imgs:[]},
  {id:'d1004',name:'Hospital Management System',domain:'Web',budget:'8,499',tech:'PHP, MySQL, Bootstrap, JS',desc:'Complete HMS with patient records, appointment scheduling, billing, and doctor dashboard.',imgs:[]},
  {id:'d1005',name:'E-Commerce Website + Admin',domain:'Web',budget:'5,999',tech:'HTML, CSS, JS, PHP, MySQL',desc:'Full e-commerce site with product management, cart, payment gateway, and admin panel.',imgs:[]},
  {id:'d1006',name:'Smart Farming IoT System',domain:'IoT',budget:'5,499',tech:'Arduino, Soil Sensor, DHT11, GSM, LCD',desc:'Automated irrigation and crop monitoring system with SMS alerts for farmers.',imgs:[]},
  {id:'d1007',name:'College ERP Portal',domain:'Web',budget:'9,999',tech:'React, Node.js, MongoDB, Express',desc:'Full college management system — students, faculty, attendance, results, and fees in one platform.',imgs:[]},
  {id:'d1008',name:'Power BI Sales Dashboard',domain:'Dashboard',budget:'3,499',tech:'Power BI, Excel, DAX',desc:'Interactive sales analytics dashboard with real-time KPIs, charts, and custom filters.',imgs:[]}
];

// ============ PAGE NAV ============
function showPage(id){document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});document.getElementById(id).classList.add('active');window.scrollTo(0,0);}
function scrollTop(){document.querySelector('#main-page').classList.add('active');document.getElementById('home').scrollIntoView({behavior:'smooth'});}
function switchTab(id,btn){document.querySelectorAll('.atc').forEach(function(c){c.classList.remove('active');});document.querySelectorAll('.atab').forEach(function(b){b.classList.remove('active');});document.getElementById(id).classList.add('active');btn.classList.add('active');}
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(function(){t.style.display='none';},2800);}

// ============ MODALS ============
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  var fw=document.getElementById('buy-form-wrap'),bs=document.getElementById('buy-success'),sf=document.getElementById('sms-form-wrap'),ss=document.getElementById('sms-success');
  if(fw)fw.style.display='';if(bs)bs.style.display='none';if(sf)sf.style.display='';if(ss)ss.style.display='none';
}
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.modal-overlay').forEach(function(el){el.addEventListener('click',function(e){if(e.target===el)closeModal(el.id);});});
});

// ============ LOGIN (checked against Firestore "settings" doc, cached locally) ============
function doLogin(){
  var u=document.getElementById('lu').value.trim(),p=document.getElementById('lp').value.trim();
  if(u===S.settings.user && p===S.settings.pass){
    document.getElementById('lerr').style.display='none';
    showPage('admin-page');
    toast('✅ Logged in');
  }else{
    document.getElementById('lerr').style.display='block';
  }
}
function doLogout(){showPage('main-page');toast('Logged out');}

// ============ RENDER: SERVICES ============
function renderServices(){
  var grid=document.getElementById('services-grid');
  var list=S.services.length?S.services:DEFAULT_SERVICES;
  grid.innerHTML=list.map(function(s){return '<div class="service-card"><div class="service-icon"><i class="'+s.icon+'"></i></div><h3>'+s.name+'</h3><p>'+s.desc+'</p></div>';}).join('');
}

// ============ RENDER: RECENT PROJECTS ============
function renderRecentProjects(){
  var grid=document.getElementById('portfolio-grid');
  var list=S.recentProjects.length?S.recentProjects:DEFAULT_RECENT;
  grid.innerHTML=list.map(function(p){return '<div class="portfolio-card"><div class="portfolio-thumb"><i class="'+p.icon+'" style="font-size:2.6rem;color:var(--light-blue);"></i></div><div class="portfolio-info"><div class="portfolio-tag">'+p.domain+'</div><h3>'+p.name+'</h3><p>'+p.about+'</p></div></div>';}).join('');
}

// ============ ADD SERVICE (Firestore) ============
async function addService(){
  var name=document.getElementById('svc-name').value.trim(),desc=document.getElementById('svc-desc').value.trim();
  if(!name||!desc){toast('⚠️ Fill Service Name & Description');return;}
  try{
    await addDoc(collection(db,'services'),{icon:selIcon['svc'],name:name,desc:desc,createdAt:Date.now()});
    document.getElementById('svc-name').value='';document.getElementById('svc-desc').value='';
    toast('✅ Service added!');
  }catch(err){console.error(err);toast('❌ Failed to add service');}
}
async function deleteSvc(id){
  if(!confirm('Delete?'))return;
  try{await deleteDoc(doc(db,'services',id));toast('🗑️ Deleted');}
  catch(err){console.error(err);toast('❌ Delete failed');}
}

// ============ ADD RECENT PROJECT (Firestore) ============
async function addRecentProject(){
  var name=document.getElementById('rp-name').value.trim(),domain=document.getElementById('rp-domain').value.trim(),about=document.getElementById('rp-about').value.trim();
  if(!name||!domain){toast('⚠️ Fill Project Name & Domain');return;}
  try{
    await addDoc(collection(db,'recentProjects'),{icon:selIcon['rp'],name:name,domain:domain,about:about,createdAt:Date.now()});
    document.getElementById('rp-name').value='';document.getElementById('rp-domain').value='';document.getElementById('rp-about').value='';
    toast('✅ Recent project added!');
  }catch(err){console.error(err);toast('❌ Failed to add');}
}
async function deleteRP(id){
  if(!confirm('Delete?'))return;
  try{await deleteDoc(doc(db,'recentProjects',id));toast('🗑️ Deleted');}
  catch(err){console.error(err);toast('❌ Delete failed');}
}

// ============ PROJECTS FOR SALE (Firestore + Cloudinary) ============
function handleProjImg(input, idx){
  if(!input.files.length) return;
  const file=input.files[0];
  projImgs[idx]=file;
  const reader=new FileReader();
  reader.onload=function(e){
    const slot=document.getElementById("slot"+idx);
    let img=slot.querySelector("img");
    if(!img){img=document.createElement("img");slot.appendChild(img);}
    img.src=e.target.result;
    slot.querySelector(".plus").style.display="none";
  };
  reader.readAsDataURL(file);
}
async function addProject(){
  const name=document.getElementById("p-name").value.trim();
  const domain=document.getElementById("p-domain").value.trim();
  const budget=document.getElementById("p-budget").value.trim();
  const tech=document.getElementById("p-tech").value.trim();
  const desc=document.getElementById("p-desc").value.trim();
  if(!name||!domain||!budget){toast("⚠️ Fill Project Name, Domain & Budget");return;}
  try{
    const images=[];
    for(const file of projImgs){
      if(file){const upload=await uploadImage(file);images.push(upload.secure_url);}
    }
    await addDoc(collection(db,"projects"),{name,domain,budget,tech,desc,imgs:images,createdAt:Date.now()});
    document.getElementById('p-name').value='';document.getElementById('p-domain').value='';document.getElementById('p-budget').value='';document.getElementById('p-tech').value='';document.getElementById('p-desc').value='';
    projImgs=[null,null,null];
    [0,1,2].forEach(function(i){var slot=document.getElementById('slot'+i);var img=slot.querySelector('img');if(img)img.remove();slot.querySelector('.plus').style.display='';});
    toast("✅ Project Uploaded");
  }catch(err){console.error(err);toast("❌ Upload Failed");}
}
async function deleteProj(id){
  if(!confirm('Delete this project?'))return;
  try{await deleteDoc(doc(db,'projects',id));toast('🗑️ Deleted');}
  catch(err){console.error(err);toast('❌ Delete failed');}
}
function renderProjects(){
  var grid=document.getElementById("proj-grid");
  var showList=S.projects.length?S.projects:DEFAULT_PROJECTS;
  grid.innerHTML=showList.map(function(p){
    var imgHtml='';
    if(p.imgs&&p.imgs.length>0){
      imgHtml='<div class="proj-imgs">';
      p.imgs.forEach(function(src,i){imgHtml+='<img src="'+src+'" class="'+(i===0?'active':'')+'" />';});
      if(p.imgs.length>1){imgHtml+='<div class="proj-img-dots">';p.imgs.forEach(function(_,i){imgHtml+='<span class="'+(i===0?'active':'')+'" onclick="switchImg(\''+p.id+'\','+i+',event)"></span>';});imgHtml+='</div>';}
      imgHtml+='<div class="proj-badge">'+p.domain+'</div></div>';
    }else{
      var icons={'IoT':'fa-microchip','AI + IoT':'fa-robot','Web':'fa-globe','Dashboard':'fa-chart-bar'};
      var ic=icons[p.domain]||'fa-folder';
      imgHtml='<div style="position:relative;"><div class="proj-no-img"><i class="fas '+ic+'" style="color:var(--light-blue);"></i></div><div class="proj-badge">'+p.domain+'</div></div>';
    }
    return '<div class="proj-card">'+imgHtml+'<div class="proj-body"><div class="proj-name">'+p.name+'</div><div class="proj-domain"><i class="fas fa-tag" style="margin-right:5px;font-size:.7rem;"></i>'+p.domain+'</div><div class="proj-budget">₹ '+p.budget+'</div>'+(p.tech?'<div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.7rem;">🛠 '+p.tech+'</div>':'')+(p.desc?'<div class="proj-desc">'+p.desc+'</div>':'')+'<div class="proj-btns"><button class="proj-buy-btn" onclick="openBuy(\''+p.id+'\')">🛒 Buy</button><button class="proj-enq-btn" onclick="openEnq(\''+p.id+'\')">📩 Enquiry</button></div></div></div>';
  }).join('');

  var sel=document.getElementById('pq-project');
  if(sel){
    var opts='<option value="">Select a project...</option>';
    showList.forEach(function(p){opts+='<option>'+p.name+'</option>';});
    opts+='<option>Other / All Projects</option>';
    sel.innerHTML=opts;
  }
}
function switchImg(pid,idx,ev){var card=ev.target.closest('.proj-card');var imgs=card.querySelectorAll('.proj-imgs img');var dots=card.querySelectorAll('.proj-img-dots span');imgs.forEach(function(i){i.classList.remove('active');});dots.forEach(function(d){d.classList.remove('active');});imgs[idx].classList.add('active');if(dots[idx])dots[idx].classList.add('active');}
function findProject(id){
  var all=S.projects.length?S.projects:DEFAULT_PROJECTS;
  return all.find(function(p){return p.id===id;});
}

// ============ BUY / ENQ ============
function openBuy(pid){var proj=findProject(pid);if(!proj)return;activeProj=proj;document.getElementById('buy-proj-label').textContent='Project: '+proj.name;document.getElementById('buy-proj').value=proj.name;document.getElementById('buy-name').value='';document.getElementById('buy-phone').value='';document.getElementById('buy-college').value='';document.getElementById('buy-form-wrap').style.display='';document.getElementById('buy-success').style.display='none';openModal('buy-modal');}
async function submitBuy(){
  var name=document.getElementById('buy-name').value.trim(),phone=document.getElementById('buy-phone').value.trim();
  if(!name||!phone){toast('⚠️ Fill Name & Phone');return;}
  try{
    await addDoc(collection(db,'orders'),{type:'BUY',name,phone,college:document.getElementById('buy-college').value.trim(),project:activeProj?activeProj.name:'',time:new Date().toLocaleString('en-IN'),createdAt:Date.now()});
    document.getElementById('buy-form-wrap').style.display='none';document.getElementById('buy-success').style.display='block';
  }catch(err){console.error(err);toast('❌ Failed to submit');}
}
function openEnq(pid){var proj=findProject(pid);if(!proj)return;activeProj=proj;document.getElementById('enq-proj-label').textContent='Project: '+proj.name;openModal('enq-choice-modal');}
function doCall(){closeModal('enq-choice-modal');window.location.href='tel:+'+S.settings.waNum;}
function openSmsForm(){closeModal('enq-choice-modal');document.getElementById('sms-proj-label').textContent='Project: '+(activeProj?activeProj.name:'');document.getElementById('sms-proj').value=activeProj?activeProj.name:'';document.getElementById('sms-name').value='';document.getElementById('sms-phone').value='';document.getElementById('sms-college').value='';document.getElementById('sms-form-wrap').style.display='';document.getElementById('sms-success').style.display='none';openModal('sms-modal');}
async function submitSms(){
  var name=document.getElementById('sms-name').value.trim(),phone=document.getElementById('sms-phone').value.trim();
  if(!name||!phone){toast('⚠️ Fill Name & Phone');return;}
  try{
    await addDoc(collection(db,'enquiries'),{type:'ENQUIRY',name,phone,college:document.getElementById('sms-college').value.trim(),project:activeProj?activeProj.name:'',time:new Date().toLocaleString('en-IN'),createdAt:Date.now()});
    document.getElementById('sms-form-wrap').style.display='none';document.getElementById('sms-success').style.display='block';
  }catch(err){console.error(err);toast('❌ Failed to submit');}
}

// ============ PROJECT ENQUIRY FORM ============
async function submitProjEnquiry(){
  var name=document.getElementById('pq-name').value.trim(),phone=document.getElementById('pq-phone').value.trim(),project=document.getElementById('pq-project').value.trim();
  if(!name||!phone||!project){toast('⚠️ Fill Name, Phone & select a Project');return;}
  try{
    await addDoc(collection(db,'enquiries'),{
      type:'PROJ-ENQ',name,phone,
      email:document.getElementById('pq-email').value.trim(),
      college:document.getElementById('pq-college').value.trim(),
      project,message:document.getElementById('pq-message').value.trim(),
      time:new Date().toLocaleString('en-IN'),createdAt:Date.now()
    });
    ['pq-name','pq-phone','pq-email','pq-college','pq-message'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('pq-project').value='';
    var s=document.getElementById('penq-success');s.style.display='block';setTimeout(function(){s.style.display='none';},5000);
    toast('✅ Enquiry sent!');
  }catch(err){console.error(err);toast('❌ Failed to submit');}
}

// ============ CONTACT FORM ============
async function submitContactForm(){
  var name=document.getElementById('cName').value.trim(),email=document.getElementById('cEmail').value.trim(),service=document.getElementById('cService').value.trim();
  if(!name||!email||!service){toast('⚠️ Fill Name, Email & Service');return;}
  try{
    await addDoc(collection(db,'enquiries'),{
      type:'CONTACT',name,email,
      phone:document.getElementById('cPhone').value.trim(),
      company:document.getElementById('cCompany').value.trim(),
      service,deadline:document.getElementById('cDeadline').value.trim(),
      message:document.getElementById('cMessage').value.trim(),
      time:new Date().toLocaleString('en-IN'),createdAt:Date.now()
    });
    ['cName','cEmail','cPhone','cCompany','cDeadline','cMessage'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('cService').value='';
    var s=document.getElementById('successMsg');s.style.display='block';setTimeout(function(){s.style.display='none';},5000);
    toast('✅ Request sent!');
  }catch(err){console.error(err);toast('❌ Failed to submit');}
}

// ============ DELETE ENQUIRY / ORDER ============
async function delSub(col,id){
  if(!confirm('Delete?'))return;
  try{await deleteDoc(doc(db,col,id));toast('🗑️ Deleted');}
  catch(err){console.error(err);toast('❌ Delete failed');}
}

// ============ BANNER (Firestore doc 'banners/main' + Cloudinary) ============
function handleBannerImg(input){
  if(!input.files[0])return;
  bannerFile=input.files[0];
  var r=new FileReader();
  r.onload=function(e){
    bannerPreviewUrl=e.target.result;
    document.getElementById('banner-prev-img').src=e.target.result;
    document.getElementById('banner-prev').style.display='block';
  };
  r.readAsDataURL(bannerFile);
}
async function saveBanner(){
  if(!bannerFile && !S.banner.img){toast('⚠️ Upload an image first');return;}
  try{
    var imgUrl=S.banner.img;
    if(bannerFile){
      toast('⏳ Uploading image...');
      var upload=await uploadImage(bannerFile);
      imgUrl=upload.secure_url;
    }
    await setDoc(doc(db,'banners','main'),{
      img:imgUrl,
      title:document.getElementById('b-title').value.trim(),
      sub:document.getElementById('b-sub').value.trim(),
      on:true
    },{merge:true});
    bannerFile=null;
    toast('🖼️ Banner applied!');
  }catch(err){console.error(err);toast('❌ Failed to save banner');}
}
async function removeBanner(){
  try{
    await setDoc(doc(db,'banners','main'),{on:false},{merge:true});
    bannerFile=null;
    document.getElementById('banner-prev').style.display='none';
    document.getElementById('b-title').value='';
    document.getElementById('b-sub').value='';
    toast('🗑️ Banner removed');
  }catch(err){console.error(err);toast('❌ Failed to remove banner');}
}
function applyBanner(){
  var el=document.getElementById('hero-banner');
  var heroSection=document.querySelector('.hero');
  if(S.banner.on && S.banner.img){
    document.getElementById('banner-img').src=S.banner.img;
    document.getElementById('banner-title-txt').textContent=S.banner.title||'';
    document.getElementById('banner-sub-txt').textContent=S.banner.sub||'';
    el.style.display='block';
    heroSection.style.paddingTop='calc(73px + 220px + 20px)';
  }else{
    el.style.display='none';
    heroSection.style.paddingTop='';
  }
}

// ============ SOCIAL (Firestore doc 'contacts/main') ============
async function saveSocial(type){
  var val=document.getElementById(type+'-inp').value.trim();
  if(!val){toast('⚠️ Enter a link');return;}
  try{
    var field={}; field[type]=val;
    await setDoc(doc(db,'contacts','main'),field,{merge:true});
    toast('✅ '+type.toUpperCase()+' link saved!');
  }catch(err){console.error(err);toast('❌ Failed to save');}
}
async function removeSocial(type){
  if(!confirm('Remove this link?'))return;
  try{
    var field={}; field[type]='';
    await setDoc(doc(db,'contacts','main'),field,{merge:true});
    document.getElementById(type+'-inp').value='';
    toast('🗑️ Link removed');
  }catch(err){console.error(err);toast('❌ Failed to remove');}
}
function applySocial(){
  var grid=document.getElementById('social-links-grid'),section=document.getElementById('social-section'),prev=document.getElementById('sp-preview');
  var btns=[],badges=[];
  if(S.social.wa){btns.push('<a href="'+S.social.wa+'" target="_blank" class="social-link-btn wa-btn"><i class="fab fa-whatsapp"></i> WhatsApp Group</a>');badges.push('<span class="sp-badge sp-wa"><i class="fab fa-whatsapp"></i> WhatsApp ✅</span>');}
  if(S.social.ig){btns.push('<a href="'+S.social.ig+'" target="_blank" class="social-link-btn ig-btn"><i class="fab fa-instagram"></i> Instagram</a>');badges.push('<span class="sp-badge sp-ig"><i class="fab fa-instagram"></i> Instagram ✅</span>');}
  if(S.social.tg){btns.push('<a href="'+S.social.tg+'" target="_blank" class="social-link-btn tg-btn"><i class="fab fa-telegram"></i> Telegram</a>');badges.push('<span class="sp-badge sp-tg"><i class="fab fa-telegram"></i> Telegram ✅</span>');}
  if(S.social.li){btns.push('<a href="'+S.social.li+'" target="_blank" class="social-link-btn li-btn"><i class="fab fa-linkedin"></i> LinkedIn</a>');badges.push('<span class="sp-badge sp-li"><i class="fab fa-linkedin"></i> LinkedIn ✅</span>');}
  if(btns.length){grid.innerHTML=btns.join('');section.style.display='block';}else{section.style.display='none';}
  if(prev)prev.innerHTML=badges.length?badges.join(''):'<span style="font-size:.8rem;color:var(--text-muted);">No links saved yet.</span>';
  if(S.social.wa!==undefined)document.getElementById('wa-inp').value=S.social.wa||'';
  if(S.social.ig!==undefined)document.getElementById('ig-inp').value=S.social.ig||'';
  if(S.social.tg!==undefined)document.getElementById('tg-inp').value=S.social.tg||'';
  if(S.social.li!==undefined)document.getElementById('li-inp').value=S.social.li||'';
}

// ============ SETTINGS (Firestore doc 'settings/main') ============
async function saveCreds(){
  var u=document.getElementById('new-u').value.trim(),p=document.getElementById('new-p').value.trim();
  if(!u && !p){toast('⚠️ Enter new username or password');return;}
  try{
    var field={};
    if(u)field.user=u;
    if(p)field.pass=p;
    await setDoc(doc(db,'settings','main'),field,{merge:true});
    document.getElementById('new-u').value='';document.getElementById('new-p').value='';
    toast('✅ Credentials updated');
  }catch(err){console.error(err);toast('❌ Failed to update');}
}
async function saveWaNum(){
  var n=document.getElementById('wa-num').value.trim();
  if(!n){toast('⚠️ Enter a number');return;}
  try{
    await setDoc(doc(db,'settings','main'),{waNum:n},{merge:true});
    document.getElementById('wa-float').href='https://wa.me/'+n;
    toast('✅ WhatsApp number updated');
  }catch(err){console.error(err);toast('❌ Failed to update');}
}

// ============ REFRESH ADMIN LISTS/COUNTS ============
function refreshAdmin(){
  var svcList=S.services, rpList=S.recentProjects, projList=S.projects;
  var showSvc=svcList.length?svcList:DEFAULT_SERVICES;
  var showRp=rpList.length?rpList:DEFAULT_RECENT;
  var showProj=projList.length?projList:DEFAULT_PROJECTS;

  document.getElementById('st-projs').textContent=showProj.length;
  document.getElementById('st-subs').textContent=(S.enquiries.length+S.orders.length);
  document.getElementById('st-svcs').textContent=showSvc.length;
  document.getElementById('st-rp').textContent=showRp.length;
  document.getElementById('proj-count').textContent=projList.length+' custom'+(projList.length?'':' (showing '+DEFAULT_PROJECTS.length+' defaults)');
  document.getElementById('sub-count').textContent=(S.enquiries.length+S.orders.length);
  document.getElementById('svc-count').textContent=showSvc.length;
  document.getElementById('rp-count').textContent=showRp.length;

  document.getElementById('wa-num').placeholder=S.settings.waNum||'917395984042';

  applySocial();

  // Projects for sale (admin list — only real Firestore docs)
  var aplist=document.getElementById('admin-proj-list');
  if(!projList.length){aplist.innerHTML='<div class="empty-box">No custom projects yet. Default 8 projects are shown on website.</div>';}
  else{aplist.innerHTML=projList.map(function(p){return '<div class="sub-card"><h4>📦 '+p.name+'<span class="sub-type buy">'+p.domain+'</span></h4><p>💰 ₹'+p.budget+'</p>'+(p.tech?'<p>🛠 '+p.tech+'</p>':'')+'<p>🖼️ '+(p.imgs?p.imgs.length:0)+' images</p><button class="del-btn" onclick="deleteProj(\''+p.id+'\')">🗑️ Delete</button></div>';}).join('');}

  // Services
  var svcAdminList=document.getElementById('admin-svc-list');
  if(!svcList.length){svcAdminList.innerHTML='<div class="empty-box">No custom services yet. Default services shown.</div>';}
  else{svcAdminList.innerHTML=svcList.map(function(s){return '<div class="sub-card"><h4><i class="'+s.icon+'" style="color:var(--light-blue);margin-right:6px;"></i>'+s.name+'</h4><p style="color:var(--text-muted);font-size:.8rem;">'+s.desc+'</p><button class="del-btn" onclick="deleteSvc(\''+s.id+'\')">🗑️ Delete</button></div>';}).join('');}

  // Recent Projects
  var rpAdminList=document.getElementById('admin-rp-list');
  if(!rpList.length){rpAdminList.innerHTML='<div class="empty-box">No recent projects yet.</div>';}
  else{rpAdminList.innerHTML=rpList.map(function(p){return '<div class="sub-card"><h4><i class="'+p.icon+'" style="color:var(--light-blue);margin-right:6px;"></i>'+p.name+'<span class="sub-type buy">'+p.domain+'</span></h4><p style="color:var(--text-muted);font-size:.8rem;">'+p.about+'</p><button class="del-btn" onclick="deleteRP(\''+p.id+'\')">🗑️ Delete</button></div>';}).join('');}

  // Enquiries + Orders combined, newest first
  var slist=document.getElementById('subs-list');
  var combined=S.orders.map(function(s){return Object.assign({},s,{_col:'orders'});})
    .concat(S.enquiries.map(function(s){return Object.assign({},s,{_col:'enquiries'});}))
    .sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);});
  if(!combined.length){slist.innerHTML='<div class="empty-box">No enquiries yet.</div>';}
  else{
    slist.innerHTML=combined.map(function(s){
      var tl=s.type==='BUY'?'BUY 🛒':s.type==='ENQUIRY'?'ENQUIRY 💬':s.type==='PROJ-ENQ'?'PROJ ENQUIRY 📦':'CONTACT 📧';
      var tc=s.type==='BUY'?'buy':'enq';
      return '<div class="sub-card"><h4>👤 '+s.name+'<span class="sub-type '+tc+'">'+tl+'</span></h4>'+
        (s.phone?'<p>📞 <span>'+s.phone+'</span></p>':'')+
        (s.email?'<p>📧 <span>'+s.email+'</span></p>':'')+
        (s.college?'<p>🏫 <span>'+s.college+'</span></p>':'')+
        (s.company?'<p>🏢 <span>'+s.company+'</span></p>':'')+
        (s.project?'<p>📦 <span>'+s.project+'</span></p>':'')+
        (s.service?'<p>🔧 <span>'+s.service+'</span></p>':'')+
        (s.message?'<p>💬 <span>'+s.message+'</span></p>':'')+
        '<div class="sub-time">⏰ '+(s.time||'')+'</div><button class="del-btn" onclick="delSub(\''+s._col+'\',\''+s.id+'\')">🗑️ Delete</button></div>';
    }).join('');
  }
}

// ============ LIVE FIRESTORE LISTENERS ============
function watchCollection(name, targetArrKey, onChange){
  onSnapshot(query(collection(db,name), orderBy('createdAt','desc')), function(snap){
    var arr=[];
    snap.forEach(function(d){arr.push(Object.assign({id:d.id}, d.data()));});
    S[targetArrKey]=arr;
    if(onChange) onChange();
  }, function(err){
    console.error('watch '+name+' failed', err);
    // Fallback: still render defaults so the site isn't blank if rules/network fail
    if(onChange) onChange();
  });
}

function initFirestoreListeners(){
  watchCollection('services','services', function(){renderServices();refreshAdmin();});
  watchCollection('recentProjects','recentProjects', function(){renderRecentProjects();refreshAdmin();});
  watchCollection('projects','projects', function(){renderProjects();refreshAdmin();});
  watchCollection('enquiries','enquiries', function(){refreshAdmin();});
  watchCollection('orders','orders', function(){refreshAdmin();});

  onSnapshot(doc(db,'banners','main'), function(snap){
    if(snap.exists()){S.banner=Object.assign({img:null,title:'',sub:'',on:false}, snap.data());}
    applyBanner();
  }, function(err){console.error('banner watch failed', err);});

  onSnapshot(doc(db,'contacts','main'), function(snap){
    if(snap.exists()){S.social=Object.assign({wa:'',ig:'',tg:'',li:''}, snap.data());}
    applySocial();
  }, function(err){console.error('contacts watch failed', err);});

  onSnapshot(doc(db,'settings','main'), function(snap){
    if(snap.exists()){
      S.settings=Object.assign({user:'admin',pass:'admin123',waNum:'917395984042'}, snap.data());
      var waFloat=document.getElementById('wa-float');
      if(waFloat && S.settings.waNum) waFloat.href='https://wa.me/'+S.settings.waNum;
    }
  }, function(err){console.error('settings watch failed', err);});
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function(){
  renderServices();
  renderRecentProjects();
  renderProjects();
  applySocial();
  refreshAdmin();
  initFirestoreListeners();
});

// ============ EXPOSE FUNCTIONS CALLED FROM onclick="" IN THE HTML ============
// (needed because this file is loaded as an ES module, whose top-level
// declarations are NOT added to window automatically)
Object.assign(window, {
  scrollTop, showPage, switchTab, toast,
  openModal, closeModal,
  doLogin, doLogout,
  toggleIconPicker, filterIcons, selectIcon,
  addService, deleteSvc,
  addRecentProject, deleteRP,
  handleProjImg, addProject, deleteProj, switchImg,
  openBuy, submitBuy, openEnq, doCall, openSmsForm, submitSms,
  submitProjEnquiry, submitContactForm, delSub,
  handleBannerImg, saveBanner, removeBanner,
  saveSocial, removeSocial,
  saveCreds, saveWaNum
});
