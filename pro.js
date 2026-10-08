(function(){
  var $=function(q,r){return (r||document).querySelector(q);},$$=function(q,r){return [].slice.call((r||document).querySelectorAll(q));};
  var WA='917395984042';
  function el(h){var d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild;}

  // preloader
  var pl=$('#preloader');function hidePl(){if(pl)pl.classList.add('hide');}
  window.addEventListener('load',function(){setTimeout(hidePl,500);});setTimeout(hidePl,3500);

  // quick-search button in nav
  var links=$('#nav-links');
  var cb=el('<li><button class="pro-btn" id="cmd-btn" title="Quick search" style="width:auto;padding:0 10px;font-size:.78rem;"><i class="fas fa-search"></i><span class="kbd">Ctrl K</span></button></li>');
  if(links)links.insertBefore(cb,links.lastElementChild);

  // hidden admin access: open  yoursite.com/#admin
  function adminRoute(){if(location.hash==='#admin'&&window.showPage){window.showPage('admin-login-page');history.replaceState(null,'',location.pathname);}}
  window.addEventListener('load',adminRoute);window.addEventListener('hashchange',adminRoute);

  // tech strip -> infinite marquee
  var items=$('.ts-items');
  if(items){items.innerHTML+=items.innerHTML;items.classList.add('marquee');var w=el('<div class="ts-wrap"></div>');items.parentNode.insertBefore(w,items);w.appendChild(items);}


  // project filter + search
  var grid=$('#proj-grid');
  if(grid){
    var tools=el('<div class="proj-tools"><div class="chips" id="chips"></div><input class="proj-search" id="proj-q" placeholder="Search projects, tech…"/></div>');
    grid.parentNode.insertBefore(tools,grid);
    var active='All',q='';
    function apply(){
      var shown=0;
      $$('.proj-card',grid).forEach(function(c){
        var dom=($('.proj-domain',c)||{textContent:''}).textContent.trim(),txt=c.textContent.toLowerCase();
        var ok=(active==='All'||dom===active)&&(!q||txt.indexOf(q)>-1);c.classList.toggle('hidden',!ok);if(ok)shown++;
      });
      var nr=$('.no-res',grid);if(nr)nr.remove();
      if(!shown&&$$('.proj-card',grid).length)grid.appendChild(el('<div class="no-res">No projects match your search.</div>'));
    }
    function chips(){
      var doms=['All'];$$('.proj-card .proj-domain',grid).forEach(function(d){var v=d.textContent.trim();if(doms.indexOf(v)<0)doms.push(v);});
      var box=$('#chips'),sig=doms.join('|');if(box.dataset.sig===sig)return;box.dataset.sig=sig;
      if(doms.indexOf(active)<0)active='All';
      box.innerHTML=doms.map(function(d){return '<button class="chip'+(d===active?' on':'')+'" data-d="'+d+'">'+d+'</button>';}).join('');
      apply();
    }
    tools.addEventListener('click',function(e){var b=e.target.closest('.chip');if(!b)return;active=b.dataset.d;$$('.chip').forEach(function(c){c.classList.toggle('on',c===b);});apply();});
    $('#proj-q').addEventListener('input',function(e){q=e.target.value.toLowerCase().trim();apply();});
    new MutationObserver(function(){chips();}).observe(grid,{childList:true});chips();
  }

  // estimator wizard
  var types=[['Website','fa-globe'],['Mobile App','fa-mobile-alt'],['Power BI Dashboard','fa-chart-bar'],['IoT / Robotics','fa-microchip']];
  var feats=[['Admin panel','fa-user-shield'],['Login / users','fa-key'],['Payments','fa-credit-card'],['Reports & charts','fa-chart-line'],['Hardware / sensors','fa-wifi'],['Cloud database','fa-database']];
  var times=[['Within 2 weeks','fa-bolt'],['1 month','fa-calendar'],['2–3 months','fa-calendar-alt'],['Flexible','fa-clock']];
  var st={step:0,type:'',feats:[],time:''};
  var est=el('<div class="est-overlay" id="est"><div class="est-box"><button class="est-x" aria-label="Close"><i class="fas fa-times"></i></button><div class="est-prog"><i></i></div><div id="est-body"></div><div class="est-nav"><button id="est-back">Back</button><button class="go" id="est-next">Next</button></div></div></div>');
  document.body.appendChild(est);
  function opts(list,sel,multi){return '<div class="opts">'+list.map(function(o){var on=multi?sel.indexOf(o[0])>-1:sel===o[0];return '<button class="opt'+(on?' on':'')+'" data-v="'+o[0]+'"><i class="fas '+o[1]+'"></i>'+o[0]+'</button>';}).join('')+'</div>';}
  function render(){
    var b=$('#est-body'),n=$('#est-next');
    $('.est-prog i').style.width=((st.step+1)*25)+'%';$('#est-back').style.visibility=st.step?'visible':'hidden';
    if(st.step===0){b.innerHTML='<h3>What do you want to build?</h3><p class="sub">Pick the closest match.</p>'+opts(types,st.type);n.textContent='Next';n.disabled=!st.type;}
    if(st.step===1){b.innerHTML='<h3>Which features do you need?</h3><p class="sub">Select all that apply.</p>'+opts(feats,st.feats,true);n.textContent='Next';n.disabled=false;}
    if(st.step===2){b.innerHTML='<h3>When do you need it?</h3><p class="sub">Your expected timeline.</p>'+opts(times,st.time);n.textContent='Next';n.disabled=!st.time;}
    if(st.step===3){b.innerHTML='<h3>Last step — your details</h3><p class="sub">We\'ll send a plan and estimate on WhatsApp.</p><input id="e-name" placeholder="Your name"/><input id="e-phone" placeholder="Phone number"/>';n.textContent='Send on WhatsApp';n.disabled=false;}
  }
  est.addEventListener('click',function(e){
    if(e.target===est||e.target.closest('.est-x')){est.classList.remove('open');return;}
    var o=e.target.closest('.opt');
    if(o){var v=o.dataset.v;
      if(st.step===0)st.type=v;else if(st.step===2)st.time=v;
      else{var i=st.feats.indexOf(v);i>-1?st.feats.splice(i,1):st.feats.push(v);}
      render();}
  });
  $('#est-back').addEventListener('click',function(){if(st.step>0){st.step--;render();}});
  $('#est-next').addEventListener('click',function(){
    if(st.step<3){st.step++;render();return;}
    var nm=$('#e-name').value.trim(),ph=$('#e-phone').value.trim();
    if(!nm||!ph){$('#e-name').style.borderColor=nm?'':'#ef4444';$('#e-phone').style.borderColor=ph?'':'#ef4444';return;}
    var msg='Hi CTECH, I need an estimate.%0A%0AProject: '+encodeURIComponent(st.type)+'%0AFeatures: '+encodeURIComponent(st.feats.join(', ')||'Not sure yet')+'%0ATimeline: '+encodeURIComponent(st.time)+'%0AName: '+encodeURIComponent(nm)+'%0APhone: '+encodeURIComponent(ph);
    window.open('https://wa.me/'+WA+'?text='+msg,'_blank');est.classList.remove('open');
  });
  function openEst(){st={step:0,type:'',feats:[],time:''};render();est.classList.add('open');}
  var hb=$('.hero-btns');if(hb){var eb=el('<a href="#" class="btn-outline" style="border-color:#22d3ee;color:#22d3ee;">⚡ Get Free Estimate</a>');eb.addEventListener('click',function(e){e.preventDefault();openEst();});hb.appendChild(eb);}

  // command palette
  var cmds=[['Home','fa-house','#home'],['Services','fa-cogs','#services'],['About us','fa-building','#about'],['Industries','fa-industry','#industries'],['How we work','fa-stream','#process'],['Portfolio','fa-briefcase','#portfolio'],['Contact','fa-envelope','#contact'],['Get free estimate','fa-bolt','est'],['Chat on WhatsApp','fa-whatsapp','wa']];
  var cm=el('<div class="cmd-overlay" id="cmd"><div class="cmd-box"><input id="cmd-in" placeholder="Jump to… (type to search)"/><div class="cmd-list" id="cmd-list"></div></div></div>');
  document.body.appendChild(cm);var sel=0,cur=cmds;
  function list(){$('#cmd-list').innerHTML=cur.map(function(c,i){return '<div class="cmd-item'+(i===sel?' sel':'')+'" data-i="'+i+'"><i class="'+(c[1]==='fa-whatsapp'?'fab':'fas')+' '+c[1]+'"></i>'+c[0]+'</div>';}).join('')||'<div class="cmd-item">No results</div>';}
  function run(c){cm.classList.remove('open');if(c[2]==='est')openEst();else if(c[2]==='wa')window.open('https://wa.me/'+WA,'_blank');else{var r=(c[2]||'').replace('#','');if(window.routeTo&&r)window.routeTo(r);}}
  function openCmd(){cur=cmds;sel=0;$('#cmd-in').value='';list();cm.classList.add('open');setTimeout(function(){$('#cmd-in').focus();},30);}
  $('#cmd-btn').addEventListener('click',openCmd);
  cm.addEventListener('click',function(e){if(e.target===cm)cm.classList.remove('open');var i=e.target.closest('.cmd-item');if(i&&cur[+i.dataset.i])run(cur[+i.dataset.i]);});
  $('#cmd-in').addEventListener('input',function(e){var v=e.target.value.toLowerCase();cur=cmds.filter(function(c){return c[0].toLowerCase().indexOf(v)>-1;});sel=0;list();});
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();cm.classList.contains('open')?cm.classList.remove('open'):openCmd();return;}
    if(e.key==='Escape'){cm.classList.remove('open');est.classList.remove('open');}
    if(cm.classList.contains('open')){
      if(e.key==='ArrowDown'){sel=Math.min(sel+1,cur.length-1);list();e.preventDefault();}
      if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);list();e.preventDefault();}
      if(e.key==='Enter'&&cur[sel])run(cur[sel]);
    }
  });

  // magnetic buttons
  if(window.matchMedia('(hover:hover)').matches){
    document.addEventListener('mousemove',function(e){
      $$('.btn-primary,.btn-outline,.nav-cta').forEach(function(b){
        var r=b.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
        b.style.transform=Math.hypot(dx,dy)<90?'translate('+dx*.18+'px,'+dy*.25+'px)':'';
      });
    },{passive:true});
  }
})();


/* =========================================================
   CTECH — NO-SCROLL ROUTE MODE
   Clicking a navigation item switches the visible page.
   ========================================================= */
(function(){
  var routes = ['home','services','about','industries','process','portfolio','contact'];
  var main = document.getElementById('main-page');
  if(!main) return;

  function routeTo(route, updateHash){
    if(routes.indexOf(route) < 0) route='home';
    main.classList.add('route-shell');

    document.querySelectorAll('#main-page .public-section, #main-page .route-home-section').forEach(function(el){
      el.classList.remove('route-active');
    });

    var targets = document.querySelectorAll('#main-page [id="'+route+'"]');
    targets.forEach(function(el){ el.classList.add('route-active'); });

    if(route==='home'){
      document.querySelectorAll('#main-page .route-home-section').forEach(function(el){el.classList.add('route-active');});
    }

    document.querySelectorAll('#nav-links a[data-route]').forEach(function(a){
      a.classList.toggle('active', a.dataset.route===route);
    });

    if(updateHash !== false){
      try{ history.replaceState(null,'','#'+route); }catch(e){}
    }
    window.scrollTo(0,0);

    // Re-run reveal setup for the newly visible route.
    setTimeout(function(){
      document.dispatchEvent(new CustomEvent('ctech:route', {detail:{route:route}}));
    }, 40);
  }

  window.routeTo = routeTo;

  window.addEventListener('DOMContentLoaded', function(){
    var initial=(location.hash||'#home').slice(1);
    if(routes.indexOf(initial)<0) initial='home';
    routeTo(initial,false);
  });

  window.addEventListener('hashchange', function(){
    var r=(location.hash||'#home').slice(1);
    if(routes.indexOf(r)>=0) routeTo(r,false);
  });
})();


/* Responsive footer accordion — delegated tap/click support for phone, tablet and iPad. */
(function(){
  function toggleFooter(el){
    var col=el && el.closest ? el.closest('.foot-accordion') : null;
    if(!col) return;
    var isOpen=col.classList.toggle('open');
    el.setAttribute('aria-expanded',isOpen?'true':'false');
  }
  document.addEventListener('click',function(e){
    var t=e.target && e.target.closest ? e.target.closest('.foot-toggle') : null;
    if(t){ e.preventDefault(); toggleFooter(t); }
  },true);
  document.addEventListener('keydown',function(e){
    var t=e.target && e.target.closest ? e.target.closest('.foot-toggle') : null;
    if(t && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); toggleFooter(t); }
  });
})();
