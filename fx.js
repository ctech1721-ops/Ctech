(function(){
  var $=function(q,r){return (r||document).querySelector(q);}, $$=function(q,r){return [].slice.call((r||document).querySelectorAll(q));};
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // scroll progress, sticky nav, back-to-top
  var bar=$('#scroll-progress'),nav=$('nav'),top=$('#to-top');
  function onScroll(){
    var h=document.documentElement,max=h.scrollHeight-h.clientHeight;
    if(bar)bar.style.width=(max>0?h.scrollTop/max*100:0)+'%';
    if(nav)nav.classList.toggle('scrolled',h.scrollTop>40);
    if(top)top.classList.toggle('show',h.scrollTop>600);
  }
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  if(top)top.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});

  // cursor glow
  var glow=$('#cursor-glow');
  window.addEventListener('mousemove',function(e){if(glow){glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';}},{passive:true});

  // typing effect
  var rot=$('#rot');
  if(rot&&!reduce){
    var words=['move your business forward','power smart campuses','turn data into decisions','connect devices to the cloud'],wi=0,ci=words[0].length,del=true;
    (function tick(){
      var w=words[wi];
      if(del){ci--;if(ci<=0){del=false;wi=(wi+1)%words.length;}}
      else{ci++;if(ci>=words[wi].length){del=true;setTimeout(tick,1800);return;}}
      rot.textContent=words[wi].slice(0,Math.max(ci,0));
      setTimeout(tick,del?28:55);
    })();
  }

  // scroll reveal (also for cards rendered later by script.js)
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
  function prep(){
    $$('.service-card,.portfolio-card,.proj-card,.step,.about-item,.stat,.faq details,.cta-inner,.bento-item,.ind-card,.stack-col,.foot-col,.contact-form,.section-title,.section-label').forEach(function(el){
      if(el.dataset.fx)return;el.dataset.fx=1;
      var sib=el.parentElement?[].indexOf.call(el.parentElement.children,el):0;
      el.style.setProperty('--d',Math.min(sib,6)*.07+'s');
      el.classList.add('reveal');io.observe(el);
      if(/card/.test(el.className))el.classList.add('tilt');
    });
  }
  prep();
  new MutationObserver(prep).observe(document.body,{childList:true,subtree:true});

  // animated counters
  var co=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting)return;co.unobserve(e.target);
    var el=e.target,end=+el.dataset.count,suf=el.dataset.suffix||'',t0=performance.now();
    (function step(t){var p=Math.min((t-t0)/1400,1);el.textContent=Math.round(end*(1-Math.pow(1-p,3)))+suf;if(p<1)requestAnimationFrame(step);})(t0);
  });},{threshold:.5});
  $$('[data-count]').forEach(function(el){co.observe(el);});

  // 3D tilt + spotlight (event delegation)
  if(!reduce&&window.matchMedia('(hover:hover)').matches){
    document.addEventListener('mousemove',function(e){
      var c=e.target.closest&&e.target.closest('.tilt');if(!c)return;
      var r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      c.style.setProperty('--mx',x+'px');c.style.setProperty('--my',y+'px');
      c.style.transform='perspective(800px) rotateX('+((y/r.height-.5)*-6)+'deg) rotateY('+((x/r.width-.5)*6)+'deg) translateY(-4px)';
    });
    document.addEventListener('mouseout',function(e){var c=e.target.closest&&e.target.closest('.tilt');if(c&&!c.contains(e.relatedTarget))c.style.transform='';});
  }

  // hero particle network
  var cv=$('#hero-canvas');
  if(cv&&!reduce){
    var cx=cv.getContext('2d'),W,H,pts=[],mouse={x:-999,y:-999};
    function size(){W=cv.width=cv.offsetWidth;H=cv.height=cv.offsetHeight;var n=Math.min(70,Math.floor(W*H/18000));pts=[];for(var i=0;i<n;i++)pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35});}
    size();window.addEventListener('resize',size);
    cv.parentElement.addEventListener('mousemove',function(e){var r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;});
    (function draw(){
      cx.clearRect(0,0,W,H);
      for(var i=0;i<pts.length;i++){
        var p=pts[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
        cx.fillStyle='rgba(96,165,250,.8)';cx.beginPath();cx.arc(p.x,p.y,1.6,0,6.283);cx.fill();
        for(var j=i+1;j<pts.length;j++){var q=pts[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<130){cx.strokeStyle='rgba(96,165,250,'+(.22*(1-d/130))+')';cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(q.x,q.y);cx.stroke();}}
        var dm=Math.hypot(p.x-mouse.x,p.y-mouse.y);if(dm<160){cx.strokeStyle='rgba(34,211,238,'+(.5*(1-dm/160))+')';cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(mouse.x,mouse.y);cx.stroke();}
      }
      requestAnimationFrame(draw);
    })();
  }
})();
