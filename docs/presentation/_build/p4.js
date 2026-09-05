(function(){
  var TRACK = /*__TRACK__*/;

  /* ============================== SPEAKER SCRIPT ============================== */
  var SCRIPT = {
    1:['Set the frame in fifteen seconds.','Course, supervisor, team, one-line pitch. Do not read the fact list out loud. It is there for the audience to skim. Say: "This is a 1/10-scale autonomous racer that manages its own battery, tires and fuel, and decides for itself when to pit."'],
    2:['The promise of the whole talk.','Land the first line and pause. Then: most small autonomous racers pretend their hardware is infinite: infinite battery, infinite tires, infinite fuel. Ours is the opposite. That one design choice is the entire project.'],
    3:['Say nothing for the first twelve seconds.','Let Monza run. Near the end: "Every one of those cars will stop at least once. The race is decided by when." Then move on. Do not analyse the clip.'],
    4:['The table of contents, disguised as a picture.','Three resources, three clocks. Point out the difference that matters: battery is genuinely measured on the car; tires and fuel are computed models, and say so now, unprompted. Whichever clock hits zero first owns the race. The strip at the bottom will keep counting for the rest of the talk.'],
    5:['Walk the six parts as they light up, do not read the labels verbatim.','Camera sees, Nano thinks, INA219 and TB6612 sense and drive, the LiPo pack is the resource being managed, the motor turns throttle into fuel burn, the servo\'s angle is what tire wear caps. One board, one battery, one camera: every strategic decision happens on this chassis while it drives.'],
    6:['The slide that corrects the report.','One frame, three independent answers. Steering is learned: we drove the track and labelled the ideal aim point ourselves. Person detection is YOLOv5, with the 2-frame confirm and 5-frame clear so a single noisy frame cannot stop the car. Markers are plain colour detection, not a learned detector, cheaper and far more reliable for two painted lines.'],
    7:['Handover to speaker 2.','Act one. The battery is the only resource we can actually measure, so this is where the strategy is real, not modelled.'],
    8:['Walk the four steps slowly.','Measure, average, project, subtract the margin. Note the two design choices worth defending: only the last five laps count, because a lap driven ten laps ago in different conditions is not evidence; and the 5 % reserve exists so the car never dies on track, where recovery is manual.'],
    9:['The first climax. Then stop talking.','Thirty-five percent in the pack. Four laps left at eight percent each is thirty-two, plus the five percent reserve is thirty-seven. Thirty-five is less than thirty-seven. Box. Then hold for three seconds and let the stamp sit there.'],
    10:['Handover to speaker 3.','Act two. Tires are the resource we cannot measure at this scale, so we have to infer them, and be honest about what that means.'],
    11:['Say the honest part before anyone asks.','There is no tire sensor on a 1/10-scale car. We charge wear for cornering, not for speed alone, because that is what actually destroys a tire. The constant is hand-tuned from watching handling degrade over test laps. It is not bench-calibrated, and the badge says so.'],
    12:['The best cyber-physical moment in the deck.','Someone taps a button on a phone. That message travels through a broker to the car, flips one flag, and the car physically caps its own throttle at about a third of dry speed. Nothing else in the code changed. A message changed what the machine is allowed to do. That is the whole course, in one command.'],
    13:['Handover to speaker 4.','Act three. Fuel is the strange one: the only resource whose disappearance is partly good news.'],
    14:['Keep it short and let the bars do the work.','Fuel burns with throttle. As it burns, the simulated car gets lighter, and a lighter car can accelerate harder. So this clock running down makes the car faster, which is exactly why real strategy is not simply "stop as late as possible".'],
    15:['The payoff. Two minutes. Do not rush.','The planner obeys the smallest clock. If a second clock runs out within two laps of the first, it is served in the same stop: one visit, both jobs, because stopping twice costs more time than it saves. Then the state machine: seeing the green marker is not enough on its own; the car only turns in if it has already decided to box. And over all of it sits the safety override, which cannot be outvoted.'],
    16:['The engineering slide.','The car and the phone never talk to each other directly. A broker on a local hotspot sits in between, so either side can disappear without breaking the other. Two transports on purpose. Roughly eighty milliseconds per-stage against a hundred millisecond target, and the badge is honest that this is a stage-by-stage estimate, not one end-to-end measurement.'],
    17:['Twenty seconds of silence, then narrate the beats.','Rain arriving. Grip falling. The tire clock collapsing. The pit window opening. The dive into the pit lane, ten seconds of service, and the rejoin. Say nothing else.'],
    18:['Be honest, then land the line.','Left column runs on the real car today. Right column is specified and simulated but not yet closed into the control loop. Say that plainly, it is a strength not a weakness. Then read the closing line once, slowly, and stop.'],
    19:['Backup · track geometry.','Six hundred and twenty-seven centreline points extracted from the track drawing, 22.01 m per lap. The pit lane joins at 74 % and rejoins at 86 % of the lap.'],
    20:['Backup · who did what.','Three workstreams, seven people.'],
    21:['Backup · full hardware list.','Everything on the car, if someone asks for the rest of the spec.'],
    22:['Backup · code organisation.','One JupyterLab notebook, seven cells, running on the Nano.']
  };

  /* ============================== BOOT ============================== */
  var stage=document.getElementById('stage');
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var N=slides.length, cur=0, step=0;
  var MAIN=slides.filter(function(s){return !s.dataset.backup;}).length;
  var reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;

  function fit(){ var s=Math.min(window.innerWidth/1280, window.innerHeight/720); stage.style.transform='scale('+s+')'; }
  window.addEventListener('resize',fit); fit();

  /* ============================== TRACK RENDER ============================== */
  function d(pts){ return 'M'+pts.map(function(p){return p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' L'); }
  function trackSVG(opts){
    opts=opts||{};
    var f=TRACK.field,b=TRACK.pitBox,sf=TRACK.startFinish;
    var cl=d(TRACK.centerline),pl=d(TRACK.pitLane);
    return '<svg viewBox="-20 -20 '+(f.w+40)+' '+(f.h+40)+'" preserveAspectRatio="xMidYMid meet">'+
      '<path class="trk-tarmac" style="stroke-width:'+TRACK.trackWidthCm+'" d="'+cl+'"/>'+
      '<path class="trk-pit-tarmac" style="stroke-width:'+TRACK.pitWidthCm+'" d="'+pl+'"/>'+
      '<rect class="trk-box" x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'"/>'+
      '<path class="trk-pit" d="'+pl+'"/>'+
      '<path class="trk-line" id="'+(opts.id||'cl')+'" d="'+cl+'"/>'+
      '<line class="trk-sf" x1="'+(sf.x-26)+'" y1="'+sf.y+'" x2="'+(sf.x+26)+'" y2="'+sf.y+'"/>'+
      (opts.car?'<g id="'+opts.car+'"><path class="car" d="M0 -9 L6 9 L0 4 L-6 9 Z"/></g>':'')+'</svg>';
  }
  function addHalo(id){
    var g=document.getElementById(id); if(!g) return;
    g.insertAdjacentHTML('afterbegin','<circle class="halo" r="16"/><circle class="halo" r="26" style="opacity:.22"/>');
  }


  var map15=document.getElementById('map15'); if(map15) map15.innerHTML=trackSVG({id:'cl15',car:'car15'});
  var trkb1=document.getElementById('trkb1'); if(trkb1) trkb1.innerHTML=trackSVG({id:'clb1'});
  [].forEach.call(document.querySelectorAll('.trk-anim'),function(w){
    var line=w.querySelector('.trk-line');
    try{ w.style.setProperty('--dl', Math.ceil(line.getTotalLength())); }catch(e){}
  });

  /*__GRIP__*/

  function CarRunner(pathEl,carEl,pitEl,opts){
    opts=opts||{};
    var L,PL,raf,t0;
    try{ L=pathEl.getTotalLength(); }catch(e){ return {start:function(){},stop:function(){}}; }
    if(pitEl){ try{ PL=pitEl.getTotalLength(); }catch(e){} }
    var entry=TRACK.pitEntryProgress,exit=TRACK.pitExitProgress;
    function frame(ts){
      if(!t0) t0=ts;
      var T=((ts-t0)/(opts.lapMs||9000))%1, pt, ang;
      if(pitEl && T>entry && T<exit){
        var q=(T-entry)/(exit-entry), dwell=0.5;
        var qq = q<dwell ? q/dwell*0.5 : 0.5+(q-dwell)/(1-dwell)*0.5;
        pt=pitEl.getPointAtLength(qq*PL);
        var p2=pitEl.getPointAtLength(Math.min(qq*PL+2,PL));
        ang=Math.atan2(p2.y-pt.y,p2.x-pt.x);
        if(opts.onState) opts.onState(q<0.55?'pit':'exit');
      } else {
        pt=pathEl.getPointAtLength(T*L);
        var pn=pathEl.getPointAtLength((T*L+3)%L);
        ang=Math.atan2(pn.y-pt.y,pn.x-pt.x);
        if(opts.onState) opts.onState('race');
      }
      carEl.setAttribute('transform','translate('+pt.x.toFixed(1)+' '+pt.y.toFixed(1)+') rotate('+(ang*180/Math.PI+90).toFixed(1)+')');
      raf=requestAnimationFrame(frame);
    }
    return {
      start:function(){ if(reduced){ var p=pathEl.getPointAtLength(0.15*L); carEl.setAttribute('transform','translate('+p.x+' '+p.y+')'); return; } if(!raf){ t0=0; raf=requestAnimationFrame(frame); } },
      stop:function(){ if(raf){ cancelAnimationFrame(raf); raf=0; } }
    };
  }

  /* ============================== HUD ============================== */
  var HUD=(function(){
    var box=document.getElementById('hud'), lab=document.getElementById('hud-l'), val=document.getElementById('hud-v');
    var curLabel='', curValue='', countRaf;
    function show(){ box.classList.add('on'); stage.classList.add('hud-on'); }
    function hide(){ box.classList.remove('on'); stage.classList.remove('hud-on'); }
    function paint(v){ val.textContent=v; }
    function set(label,value,opts){
      opts=opts||{};
      if(label===curLabel && value===curValue) return;
      var wasNum=parseFloat(curValue), isNum=parseFloat(value);
      curLabel=label; curValue=value;
      if(reduced){ lab.textContent=label; paint(value); return; }
      cancelAnimationFrame(countRaf);
      if(opts.numeric && !isNaN(wasNum) && !isNaN(isNum)){
        lab.textContent=label;
        var t0=0, suffix=(value.match(/[^0-9.\-]+$/)||[''])[0], dec=(String(value).split('.')[1]||'').replace(/[^0-9]/g,'').length;
        (function tick(ts){
          if(!t0) t0=ts;
          var k=Math.min(1,(ts-t0)/500), e=1-Math.pow(1-k,3);
          paint((wasNum+(isNum-wasNum)*e).toFixed(dec)+suffix);
          if(k<1) countRaf=requestAnimationFrame(tick); else paint(value);
        })(0);
        return;
      }
      val.classList.remove('settle','in'); val.classList.add('out');
      setTimeout(function(){
        lab.textContent=label; paint(value);
        val.classList.remove('out'); val.classList.add('in');
        void val.offsetWidth;
        val.classList.remove('in'); val.classList.add('settle');
      },165);
    }
    function alarm(){ box.classList.remove('alarm'); void box.offsetWidth; box.classList.add('alarm'); setTimeout(function(){box.classList.remove('alarm');},700); }
    function wet(on){ box.classList.toggle('hud--wet',!!on); }
    return {show:show,hide:hide,set:set,alarm:alarm,wet:wet};
  })();

  /* ============================== CLOCK RAIL ============================== */
  var RAIL=(function(){
    var el=document.getElementById('rail');
    var segs={}; [].forEach.call(el.querySelectorAll('.rseg'),function(s){ segs[s.dataset.k]=s; });
    var DEF={batt:{v0:4.5,r:0.0062,max:4.5},tire:{v0:7.2,r:0.0031,max:7.2},fuel:{v0:3.8,r:0.0021,max:3.8}};
    var t0=0, elapsed=0, last=0, raf=0, running=false, battZero=false;
    var out={batt:document.getElementById('rv-batt'),tire:document.getElementById('rv-tire'),fuel:document.getElementById('rv-fuel')};
    var bars={batt:document.getElementById('rb-batt'),tire:document.getElementById('rb-tire'),fuel:document.getElementById('rb-fuel')};
    function val(k){
      var c=DEF[k], v=Math.max(0,c.v0-c.r*elapsed);
      if(k==='batt') v = battZero ? 0 : Math.max(0.1,v);
      return v;
    }
    function paint(){
      Object.keys(DEF).forEach(function(k){
        var v=val(k);
        out[k].textContent=v.toFixed(1);
        bars[k].style.width=Math.max(0,Math.min(100,v/DEF[k].max*100))+'%';
        segs[k].classList.toggle('low',v<=0.6);
      });
    }
    function loop(ts){
      if(!running) return;
      if(!last) last=ts;
      if(!document.hidden) elapsed+=(ts-last)/1000;
      last=ts; paint();
      raf=requestAnimationFrame(loop);
    }
    return {
      show:function(){ el.classList.add('on'); stage.classList.add('rail-on'); if(!running){ running=true; last=0; raf=requestAnimationFrame(loop); } paint(); },
      hide:function(){ el.classList.remove('on'); stage.classList.remove('rail-on'); },
      stop:function(){ running=false; cancelAnimationFrame(raf); raf=0; },
      focus:function(k){ Object.keys(segs).forEach(function(s){ segs[s].classList.toggle('hot', k==='all'||s===k); }); },
      set:function(k,v){ DEF[k].v0=v+DEF[k].r*elapsed; paint(); },
      zeroBattery:function(){ battZero=true; paint(); },
      pulse:function(k){ var s=segs[k]; s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); setTimeout(function(){s.classList.remove('pulse');},1000); },
      value:function(k){ return val(k); }
    };
  })();

  /* ============================== COLD OPEN ============================== */
  var coldRun=false;
  function coldOpen(){
    var lights=document.getElementById('lights');
    if(coldRun||reduced){ if(lights) lights.classList.add('out'); return; }
    coldRun=true;
    var bulbs=[].slice.call(document.querySelectorAll('#lights .bulb'));
    var cols=[[0,1],[2,3],[4,5],[6,7],[8,9]];
    document.getElementById('streaks').classList.add('go');
    cols.forEach(function(c,i){ setTimeout(function(){ c.forEach(function(k){bulbs[k].classList.add('on')}); },320*(i+1)); });
    setTimeout(function(){ bulbs.forEach(function(b){b.classList.remove('on')}); lights.classList.add('out'); document.getElementById('streaks').classList.remove('go'); },2200);
  }

  /* ============================== PER-SLIDE HOOKS ============================== */
  var stepHooks={}, enterHooks={}, leaveHooks={}, done={};

  /* ============================== VECTOR JETRACER (anatomy slide) ============================== */
  function jrWheel(cx,cy){
    var s='<circle class="tyre" cx="'+cx+'" cy="'+cy+'" r="56"/>'
        +'<circle class="rim" cx="'+cx+'" cy="'+cy+'" r="34"/>'
        +'<circle class="rim" cx="'+cx+'" cy="'+cy+'" r="14"/>';
    for(var i=0;i<6;i++){
      var a=i*Math.PI/3;
      s+='<line class="ln thin" x1="'+(cx+14*Math.cos(a)).toFixed(1)+'" y1="'+(cy+14*Math.sin(a)).toFixed(1)
        +'" x2="'+(cx+34*Math.cos(a)).toFixed(1)+'" y2="'+(cy+34*Math.sin(a)).toFixed(1)+'"/>';
    }
    return s;
  }
  function jrBody(p){
    var s='';
    s+='<ellipse class="shadow" fill="url(#'+p+'-sh)" cx="320" cy="300" rx="248" ry="15"/>';
    s+='<g class="part" id="'+p+'-chassis">'
      +'<rect class="fillpanel" x="104" y="206" width="430" height="26" rx="9"/>'
      +'<rect class="ln" x="104" y="206" width="430" height="26" rx="9"/>'
      +'<rect class="fillpanel" x="138" y="166" width="368" height="13" rx="3"/>'
      +'<rect class="ln" x="138" y="166" width="368" height="13" rx="3"/>'
      +'<rect class="ln thin" x="162" y="179" width="8" height="27"/>'
      +'<rect class="ln thin" x="316" y="179" width="8" height="27"/>'
      +'<rect class="ln thin" x="474" y="179" width="8" height="27"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-wheel">'+jrWheel(150,234)+jrWheel(486,234)+'</g>';
    s+='<g class="part" id="'+p+'-motor">'
      +'<rect class="fillbody" x="182" y="176" width="66" height="30" rx="9"/>'
      +'<rect class="ln" x="182" y="176" width="66" height="30" rx="9"/>'
      +'<line class="ln thin" x1="198" y1="178" x2="198" y2="204"/>'
      +'<line class="ln thin" x1="212" y1="178" x2="212" y2="204"/>'
      +'<line class="ln thin" x1="226" y1="178" x2="226" y2="204"/>'
      +'<circle class="ln thin" cx="176" cy="191" r="7"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-servo">'
      +'<rect class="fillbody" x="434" y="174" width="50" height="32" rx="4"/>'
      +'<rect class="ln" x="434" y="174" width="50" height="32" rx="4"/>'
      +'<circle class="ln" cx="459" cy="190" r="9"/>'
      +'<line class="ln thin" x1="468" y1="190" x2="486" y2="210"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-batt">'
      +'<rect class="fillbody" x="148" y="114" width="110" height="52" rx="6"/>'
      +'<rect class="ln am" x="148" y="114" width="110" height="52" rx="6"/>'
      +'<line class="ln am thin" x1="185" y1="116" x2="185" y2="164"/>'
      +'<line class="ln am thin" x1="221" y1="116" x2="221" y2="164"/>'
      +'<path class="ln am thin" d="M258 128 h14 v12"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-nano">'
      +'<rect class="fillbody" x="272" y="130" width="152" height="36" rx="3"/>'
      +'<rect class="ln" x="272" y="130" width="152" height="36" rx="3"/>'
      +'<rect class="fillpanel" x="298" y="98" width="102" height="32" rx="2"/>'
      +'<rect class="ln" x="298" y="98" width="102" height="32" rx="2"/>';
    for(var i=0;i<9;i++){ var x=306+i*11; s+='<line class="ln thin" x1="'+x+'" y1="101" x2="'+x+'" y2="127"/>'; }
    s+='<rect class="ln thin" x="280" y="140" width="14" height="18"/>'
      +'<rect class="ln thin" x="402" y="140" width="16" height="18"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-elec">'
      +'<rect class="fillbody" x="430" y="106" width="60" height="26" rx="2"/>'
      +'<rect class="ln gr" x="430" y="106" width="60" height="26" rx="2"/>'
      +'<rect class="ln gr thin" x="446" y="112" width="28" height="14"/>'
      +'<rect class="fillbody" x="430" y="138" width="60" height="26" rx="2"/>'
      +'<rect class="ln gr" x="430" y="138" width="60" height="26" rx="2"/>'
      +'<circle class="ln gr thin" cx="460" cy="151" r="7"/>'
      +'</g>';
    s+='<g class="part" id="'+p+'-cam">'
      +'<rect class="fillpanel" x="498" y="100" width="11" height="66" rx="2"/>'
      +'<rect class="ln" x="498" y="100" width="11" height="66" rx="2"/>'
      +'<rect class="fillbody" x="466" y="58" width="72" height="44" rx="7"/>'
      +'<rect class="ln am" x="466" y="58" width="72" height="44" rx="7"/>'
      +'<circle class="lens" cx="520" cy="80" r="14"/>'
      +'<circle class="ln am thin" cx="520" cy="80" r="7"/>'
      +'<polygon class="fov" fill="url(#'+p+'-fov)" points="535,80 660,20 660,148"/>'
      +'</g>';
    s+='<path class="ln thin" d="M258 150 C 266 150 264 141 272 141"/>';
    s+='<path class="ln thin" d="M424 148 C 427 148 427 150 430 150"/>';
    return s;
  }
  function jrDefs(p){
    return '<defs>'
      +'<radialGradient id="'+p+'-sh"><stop offset="0%" stop-color="#000" stop-opacity=".8"/>'
      +'<stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>'
      +'<linearGradient id="'+p+'-fov" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0%" stop-color="#FFB020" stop-opacity=".3"/>'
      +'<stop offset="100%" stop-color="#FFB020" stop-opacity="0"/></linearGradient></defs>';
  }
  function jrPrime(root){
    [].forEach.call(root.querySelectorAll('.ln,.rim'),function(el){
      var L=1400; try{ L=Math.ceil(el.getTotalLength())+4; }catch(e){}
      el.style.setProperty('--d',L);
    });
  }
  var ANAT=[
    {k:'cam',  n:'01', t:'IMX219 camera',      d:'the only sensor that sees', a:[770,202], b:[916,104], route:[[916,136],[848,136]]},
    {k:'nano', n:'02', t:'Jetson Nano',        d:'perception and physics, one board', a:[599,234], b:[20,112],  route:[[248,144],[520,144]]},
    {k:'elec', n:'03', t:'INA219 + TB6612',    d:'pack sensing, motor drive',  a:[710,256], b:[916,244], route:[[916,276],[826,276]]},
    {k:'batt', n:'04', t:'2S LiPo pack',       d:'the resource being managed',         a:[453,260], b:[20,252],  route:[[248,284],[386,284]]},
    {k:'motor',n:'05', t:'Brushed motor',      d:'throttle becomes fuel burn',         a:[465,311], b:[20,392],  route:[[248,424],[402,424]]},
    {k:'servo',n:'06', t:'Steering servo',     d:'tire wear caps this angle',          a:[709,310], b:[916,392], route:[[916,424],[818,424]]}
  ];
  var jranat=document.getElementById('jranat');
  if(jranat){
    var ga='<svg viewBox="0 0 1180 560">'+jrDefs('an')
      +'<g transform="translate(250,120)">'+jrBody('an')+'</g>';
    ANAT.forEach(function(c,i){
      var bx=c.b[0], by=c.b[1], W=248, H=76;
      var pts=[c.a].concat(c.route).map(function(q){return q[0]+','+q[1];}).join(' ');
      ga+='<g class="call" id="an-c'+(i+1)+'">'
        +'<polyline class="leader" points="'+pts+'"/>'
        +'<circle class="dot" cx="'+c.a[0]+'" cy="'+c.a[1]+'" r="4.5"/>'
        +'<rect class="cbox" x="'+bx+'" y="'+by+'" width="'+W+'" height="'+H+'" rx="2"/>'
        +'<text class="cn" x="'+(bx+15)+'" y="'+(by+23)+'">'+c.n+'</text>'
        +'<text class="ct" x="'+(bx+15)+'" y="'+(by+46)+'">'+c.t+'</text>'
        +'<text class="cs" x="'+(bx+15)+'" y="'+(by+65)+'">'+c.d+'</text>'
        +'</g>';
    });
    ga+='</svg>';
    jranat.innerHTML=ga;
    jrPrime(jranat);
    stepHooks.p05=function(st){
      jranat.classList.toggle('focusing', st>=1);
      ANAT.forEach(function(c,i){
        var pt=document.getElementById('an-'+c.k); if(pt) pt.classList.toggle('hot', i<st);
        var el=document.getElementById('an-c'+(i+1)); if(el) el.classList.toggle('on', i<st);
      });
    };
    enterHooks.p05=function(){ jranat.classList.remove('drawn'); void jranat.offsetWidth; jranat.classList.add('drawn'); };
    leaveHooks.p05=function(){ jranat.classList.remove('drawn'); };
  }

  /* 06 - YOLO confirmation counter */
  var yoloTimer;
  enterHooks.p06=function(){
    var el=document.getElementById('yolocount'); if(!el||reduced) return;
    var n=0;
    clearInterval(yoloTimer);
    yoloTimer=setInterval(function(){
      n=(n+1)%8;
      if(n<2) el.innerHTML='frame '+(n+1)+' &middot; person seen';
      else if(n===2) el.innerHTML='2 in a row &nbsp;&rarr;&nbsp; <b style="color:var(--red)">CONFIRMED &middot; reverse</b>';
      else if(n<7) el.innerHTML=(n-2)+' clear frame'+(n-2>1?'s':'');
      else el.innerHTML='5 clear &nbsp;&rarr;&nbsp; <b style="color:var(--green)">ALL CLEAR</b>';
    },700);
  };
  leaveHooks.p06=function(){ clearInterval(yoloTimer); };

  /* 09 - verdict stamp */
  stepHooks.p09=function(st){
    var cmp=document.getElementById('cmp09'), stamp=document.getElementById('stamp09');
    cmp.classList.toggle('hot',st>=4);
    stamp.classList.toggle('on',st>=4);
  };

  /* 11 - tire corners */
  var TY=['fl','fr','rl','rr'], tyTarget={fl:34,fr:78,rl:52,rr:88};
  stepHooks.p11=function(st){
    TY.forEach(function(k){
      var el=document.getElementById('ty-'+k); if(!el) return;
      var v=st>=2?tyTarget[k]:100;
      el.querySelector('i').style.height=v+'%';
      el.querySelector('b').textContent=v;
      el.classList.toggle('worn',v<60&&v>=30);
      el.classList.toggle('crit',v<30);
    });
  };
  enterHooks.p11=function(){ stepHooks.p11(1); };

  /* 12 - rain, grip chart, throttle */
  var rain12=document.getElementById('rain12');
  if(rain12){
    var rh='';
    for(var r=0;r<52;r++){
      rh+='<i style="left:'+(Math.random()*100).toFixed(1)+'%;animation-duration:'
        +(0.75+Math.random()*0.6).toFixed(2)+'s;animation-delay:-'+(Math.random()*1.4).toFixed(2)+'s"></i>';
    }
    rain12.innerHTML=rh;
  }
  enterHooks.p12=function(){
    if(!done.grip){ gripChart(document.getElementById('gripchart')); done.grip=1; }
    setTimeout(function(){ if(rain12) rain12.classList.add('on'); },260);
  };
  leaveHooks.p12=function(){ if(rain12) rain12.classList.remove('on'); };
  stepHooks.p12=function(st){
    var bar=document.getElementById('thrbar'), v=document.getElementById('thrval');
    if(!bar) return;
    bar.classList.toggle('wet',st>=4);
    bar.querySelector('i').style.width=(st>=4?35:100)+'%';
    v.textContent=(st>=4?'0.07':'0.20');
  };

  /* 14 - mass down, acceleration up */
  stepHooks.p14=function(st){
    var m=document.getElementById('ss-mass'), a=document.getElementById('ss-acc'),
        mv=document.getElementById('ss-massv'), av=document.getElementById('ss-accv');
    if(!m) return;
    var low=st>=3;
    m.style.width=(low?22:100)+'%'; mv.textContent=low?'22':'100';
    a.style.width=(low?92:34)+'%';  av.textContent=low?'118':'100';
  };
  enterHooks.p14=function(){ stepHooks.p14(1); };

  /* 15 - climax */
  var run15;
  enterHooks.p15=function(){
    if(!run15 && map15) run15=CarRunner(document.getElementById('cl15'),document.getElementById('car15'),map15.querySelector('.trk-pit'),{lapMs:11000});
    if(run15) run15.start();
  };
  leaveHooks.p15=function(){ if(run15) run15.stop(); };
  stepHooks.p15=function(st){
    var chips={batt:document.getElementById('dc-batt'),tire:document.getElementById('dc-tire'),fuel:document.getElementById('dc-fuel')};
    if(chips.batt){
      chips.batt.textContent='Battery 0.0';
      chips.tire.textContent='Tires '+RAIL.value('tire').toFixed(1);
      chips.fuel.textContent='Fuel '+RAIL.value('fuel').toFixed(1);
      chips.batt.classList.toggle('win',st>=4);
    }
    ['fn1','fn2','fn3'].forEach(function(id,i){
      var el=document.getElementById(id); if(!el) return;
      el.classList.toggle('hot',st>=5&&i===1);
      el.classList.toggle('done',st>=5&&i!==1);
    });
    if(st>=6){
      var f=document.getElementById('flash15');
      if(f&&!f.dataset.hit){ f.dataset.hit='1'; f.classList.add('hit'); setTimeout(function(){f.classList.remove('hit');f.dataset.hit='';},600); }
    }
  };

  /* 16 - latency bars */
  stepHooks.p16=function(st){
    ['lat1','lat2','lat3','lat4'].forEach(function(id,i){
      var el=document.getElementById(id); if(el) el.classList.toggle('shown',st>=4);
    });
  };

  /* 17 - race simulation */
  var simmap=document.getElementById('simmap'), simRaf;
  if(simmap){
    simmap.innerHTML=trackSVG({id:'clsim',car:'carsim'});
    addHalo('carsim');
    var srain=document.getElementById('simrain');
    if(srain){
      var sh='';
      for(var q=0;q<46;q++){
        sh+='<i style="left:'+(Math.random()*100).toFixed(1)+'%;animation-duration:'
          +(0.55+Math.random()*0.5).toFixed(2)+'s;animation-delay:-'+(Math.random()*1.2).toFixed(2)+'s"></i>';
      }
      srain.innerHTML=sh;
    }
    var simPath=document.getElementById('clsim'), simCar=document.getElementById('carsim'),
        simPit=simmap.querySelector('.trk-pit');
    enterHooks.p17=function(){
      if(simRaf) return;
      var L,PL; try{ L=simPath.getTotalLength(); }catch(e){ return; }
      try{ PL=simPit.getTotalLength(); }catch(e){}
      var entry=TRACK.pitEntryProgress, exit=TRACK.pitExitProgress;
      var t0=0, tp=0, lap=1, batt=100, tyre=100, fuel=100, wetTyres=false, pitArmed=false, LAPT=6200;
      var lapSec=LAPT/1000, battRate=2.7, tyreRate=3.2, fuelRate=2.3;
      function put(id,txt){ var el=document.getElementById(id); if(el) el.innerHTML=txt; }
      (function loop(ts){
        if(!t0){ t0=ts; tp=ts; }
        var dt=Math.min(0.05,(ts-tp)/1000); tp=ts;
        var el=(ts-t0), T=(el/LAPT)%1, n=Math.floor(el/LAPT)+1;
        if(n!==lap){ lap=n; }
        var secs=el/1000;
        var wet=Math.max(0,Math.min(1,(secs-9)/5));
        var grip=1-0.30*wet;
        var wEl=document.getElementById('simweather');
        if(wEl) wEl.classList.toggle('wet',wet>0.12);
        if(srain) srain.classList.toggle('on',wet>0.12);
        put('sim-wv',(wet>0.55?'WET':(wet>0.12?'DAMP':'DRY'))+' &middot; grip '+grip.toFixed(2));
        var wn=document.getElementById('sim-wn');
        if(wn) wn.textContent = wet>0.12 ? 'Grip ceiling cut. Throttle capped, tires wearing faster.' : 'Rain is triggered from the app, not sensed.';
        var tyreRateNow=tyreRate*(1+wet*1.6)*(wetTyres?0.62:1);
        batt=Math.max(0,batt-battRate*dt);
        tyre=Math.max(0,tyre-tyreRateNow*dt);
        fuel=Math.max(0,fuel-fuelRate*dt);
        var lapsB=batt/(battRate*lapSec), lapsT=tyre/(tyreRateNow*lapSec||1), lapsF=fuel/(fuelRate*lapSec);
        var lowestLaps=Math.min(lapsB,lapsT,lapsF);
        var limiter = lapsB<=lapsT&&lapsB<=lapsF ? 'battery' : (lapsT<=lapsF ? 'tires' : 'fuel');
        var needCompound = wet>0.5 && !wetTyres;
        if(!pitArmed && (lowestLaps<=3 || needCompound)) pitArmed=true;
        var inPit = simPit && pitArmed && T>entry && T<exit;
        if(inPit && T>entry+(exit-entry)*0.45 && T<entry+(exit-entry)*0.6){
          batt=100; tyre=100; fuel=100; wetTyres=(wet>0.35); pitArmed=false;
          var fl=document.getElementById('simflash');
          if(fl && !fl.classList.contains('go')){ fl.classList.add('go'); setTimeout(function(){ fl.classList.remove('go'); },1500); }
        }
        var bn=document.getElementById('simbanner');
        if(bn){
          bn.classList.toggle('on', pitArmed && !inPit);
          var lapsRound=Math.max(0,Math.round(lowestLaps));
          var boxWhen = lapsRound<=0 ? 'Box now' : 'Box in '+lapsRound+' '+(lapsRound===1?'lap':'laps');
          bn.textContent = needCompound ? boxWhen+' &middot; wet tires needed' : boxWhen+' &middot; '+limiter+' limited';
        }
        put('sim-lap',('0'+lap).slice(-2));
        var stEl=document.getElementById('sim-state');
        if(stEl){
          stEl.textContent = inPit ? (T<entry+(exit-entry)*0.6?'PIT SERVICE':'PIT EXIT') : 'RACING';
          stEl.style.color = inPit ? '#FFB020' : '#34E1D6';
        }
        function bar(idv,idb,v,unit,dec){
          var a=document.getElementById(idv), b=document.getElementById(idb);
          if(a) a.innerHTML=(dec?v.toFixed(2):Math.round(v))+'<span class="gu">'+unit+'</span>';
          if(b) b.style.width=Math.max(0,Math.min(100,dec?v*100:v))+'%';
        }
        bar('sim-batt','simb-batt',batt,'%'); bar('sim-tyre','simb-tyre',tyre,'%');
        bar('sim-fuel','simb-fuel',fuel,'%'); bar('sim-grip','simb-grip',grip,'\u00B5',true);
        var pt,ang;
        if(simPit && inPit){
          var qq0=(T-entry)/(exit-entry), dwell=0.5;
          var qq=qq0<dwell?qq0/dwell*0.5:0.5+(qq0-dwell)/(1-dwell)*0.5;
          pt=simPit.getPointAtLength(qq*PL);
          var p2=simPit.getPointAtLength(Math.min(qq*PL+2,PL));
          ang=Math.atan2(p2.y-pt.y,p2.x-pt.x);
        } else {
          pt=simPath.getPointAtLength(T*L);
          var pn=simPath.getPointAtLength((T*L+3)%L);
          ang=Math.atan2(pn.y-pt.y,pn.x-pt.x);
        }
        if(simCar) simCar.setAttribute('transform','translate('+pt.x.toFixed(1)+' '+pt.y.toFixed(1)+') rotate('+(ang*180/Math.PI+90).toFixed(1)+')');
        simRaf=requestAnimationFrame(loop);
      })(0);
    };
    leaveHooks.p17=function(){
      if(simRaf){ cancelAnimationFrame(simRaf); simRaf=0; }
      if(srain) srain.classList.remove('on');
    };
  }

  enterHooks.b01=function(){ setTimeout(function(){ if(trkb1) trkb1.classList.add('drawn'); },160); };

  /* ============================== HUD / RAIL CHOREOGRAPHY ============================== */
  var CHOREO={
    p04:function(st){
      if(st>=1){ RAIL.show(); RAIL.focus('all'); HUD.show(); HUD.set('Battery','41 %'); }
      else { RAIL.hide(); HUD.hide(); }
    },
    p05:function(){ HUD.set('Battery','41 %'); RAIL.focus('all'); },
    p06:function(){ HUD.set('Camera','65 FPS'); RAIL.focus('all'); },
    p07:function(){ HUD.set('Battery','41 %'); RAIL.focus('batt'); },
    p08:function(st){
      RAIL.focus('batt');
      if(st>=5) HUD.set('Battery · laps','4.5',{numeric:true});
      else if(st>=4) HUD.set('Battery · laps','5.1',{numeric:true});
      else HUD.set('Battery','41 %');
    },
    p09:function(st){
      RAIL.focus('batt');
      if(st>=4){ if(!done.s09a){ done.s09a=1; HUD.alarm(); RAIL.pulse('batt'); } HUD.set('Decision','BOX'); }
      else HUD.set('Battery','35 %');
    },
    p10:function(){ HUD.wet(false); HUD.set('Tires · laps',RAIL.value('tire').toFixed(1)); RAIL.focus('tire'); },
    p11:function(){ HUD.wet(false); HUD.set('Tires · laps',RAIL.value('tire').toFixed(1)); RAIL.focus('tire'); },
    p12:function(st){
      RAIL.focus('tire');
      if(st>=4){ HUD.wet(true); HUD.set('Max throttle','0.07'); if(!done.s12r){ done.s12r=1; RAIL.set('tire',2.1); RAIL.pulse('tire'); } }
      else { HUD.wet(false); HUD.set('Max throttle','0.20'); }
    },
    p13:function(){ HUD.wet(true); HUD.set('Fuel · laps',RAIL.value('fuel').toFixed(1)); RAIL.focus('fuel'); },
    p14:function(){ HUD.wet(true); HUD.set('Fuel · laps',RAIL.value('fuel').toFixed(1)); RAIL.focus('fuel'); },
    p15:function(st){
      HUD.wet(false); RAIL.focus('all'); RAIL.zeroBattery();
      if(st>=5) HUD.set('State','PIT SERVICE');
      else if(st>=4){ if(!done.s15a){ done.s15a=1; HUD.alarm(); RAIL.pulse('batt'); } HUD.set('Decision','BOX'); }
      else HUD.set('Battery · laps','0.0');
    },
    p16:function(){ HUD.wet(false); RAIL.focus('all'); HUD.set('Telemetry','~80 ms'); },
    p17:function(){ HUD.hide(); RAIL.hide(); },
    p18:function(st){
      HUD.wet(false);
      if(st>=3){ RAIL.show(); RAIL.focus('all'); HUD.show(); HUD.set('Battery','41 %'); }
      else { HUD.hide(); RAIL.hide(); }
    }
  };
  /* every slide from 04 to 16 keeps the HUD and the rail on screen, so jumping
     straight to a slide by hash or from the overview lands in the right state. */
  var PERSIST={p04:1,p05:1,p06:1,p07:1,p08:1,p09:1,p10:1,p11:1,p12:1,p13:2,p14:2,p15:2,p16:2};
  function choreo(){
    var id=slides[cur].id, fn=CHOREO[id];
    if(PERSIST[id]){ RAIL.show(); HUD.show(); }
    if(PERSIST[id]>1 && RAIL.value('tire')>2.6) RAIL.set('tire',2.1);
    if(fn){ fn(step); return; }
    HUD.hide(); RAIL.hide();
  }

  /* ============================== ENGINE ============================== */
  function onEnter(i){
    var id=slides[i].id;
    if(id==='p01') coldOpen();
    if(id==='svid'){ var mv=document.getElementById('vid-monza'); if(mv){ try{mv.currentTime=0;}catch(e){} var pp=mv.play(); if(pp&&pp.catch) pp.catch(function(){}); } }
    if(enterHooks[id]) enterHooks[id]();
  }
  function onLeave(i){
    var id=slides[i].id;
    if(id==='svid'){ var mv=document.getElementById('vid-monza'); if(mv) mv.pause(); }
    if(leaveHooks[id]) leaveHooks[id]();
  }
  function renderSteps(){
    var s=slides[cur];
    [].forEach.call(s.querySelectorAll('.step'),function(el){ el.classList.toggle('shown',(+el.dataset.s)<=step); });
    if(stepHooks[s.id]) stepHooks[s.id](step);
    choreo();
  }
  function maxStep(){ return +slides[cur].dataset.steps||0; }

  function go(i){
    i=Math.max(0,Math.min(N-1,i)); if(i===cur) return;
    onLeave(cur);
    slides[cur].classList.remove('is-active'); slides[cur].classList.add('is-leaving');
    var was=cur; cur=i; step=Math.min(1,maxStep());
    setTimeout(function(){ slides[was].classList.remove('is-leaving'); },340);
    slides[cur].classList.add('is-active');
    renderSteps(); updateChrome(); onEnter(cur); markSlide();
    location.hash=(cur+1);
  }
  function nextIndex(from,dir){
    var i=from+dir;
    while(i>=0&&i<N&&slides[i].dataset.backup) i+=dir;
    return (i>=0&&i<N)?i:-1;
  }
  function next(){
    if(step<maxStep()){ step++; renderSteps(); updateChrome(); return; }
    var i=slides[cur].dataset.backup?nextIndex(cur,1):nextIndex(cur,1);
    if(i>=0) go(i);
  }
  function prev(){
    if(step>1){ step--; renderSteps(); return; }
    var i=nextIndex(cur,-1);
    if(i>=0){ go(i); step=maxStep(); renderSteps(); updateChrome(); }
  }

  var acts=[{n:'The race',a:1,b:6},{n:'Battery',a:7,b:9},{n:'Tires',a:10,b:12},{n:'Fuel',a:13,b:14},{n:'The call',a:15,b:16},{n:'Close',a:17,b:18}];
  function updateChrome(){
    var human=cur+1, isBk=!!slides[cur].dataset.backup;
    document.getElementById('f-section').textContent=slides[cur].dataset.section;
    document.getElementById('f-count').textContent= isBk ? 'BACKUP' : ((human<10?'0':'')+human+' · '+MAIN);
    var segs=document.querySelectorAll('#sector i');
    acts.forEach(function(ac,k){
      var seg=segs[k]; if(!seg) return;
      if(human>ac.b){ seg.classList.add('done'); seg.style.setProperty('--fill','100%'); }
      else if(human<ac.a){ seg.classList.remove('done'); seg.style.setProperty('--fill','0%'); }
      else { seg.classList.remove('done'); seg.style.setProperty('--fill',((human-ac.a)/Math.max(1,(ac.b-ac.a))*100)+'%'); }
    });
    var sc=SCRIPT[human]||['',''];
    document.getElementById('script-n').textContent='Slide '+human+' · '+slides[cur].dataset.section;
    document.getElementById('script-body').innerHTML='<p><strong>'+sc[0]+'</strong></p><p>'+sc[1]+'</p>';
  }

  var ov=document.getElementById('overview');
  slides.forEach(function(s,i){
    var c=document.createElement('div'); c.className='ovcard'+(s.dataset.backup?' backup':'');
    var h=s.querySelector('h1,h2,.atitle');
    c.innerHTML='<div class="n">'+(i+1<10?'0':'')+(i+1)+'</div><div class="t">'+(h?h.textContent:s.dataset.section)+'</div>'+
      (s.dataset.backup?'<div class="bktag">backup</div>':'');
    c.onclick=function(){ ov.classList.remove('on'); go(i); };
    ov.appendChild(c);
  });

  /* ============================== REHEARSAL TIMER ============================== */
  var TARGET=[35,25,32,55,50,45,12,80,65,12,55,70,12,50,130,60,50,54];
  var tEl=document.getElementById('timer'), tOn=false, tStart=0, tSlide=0, tRaf;
  function mmss(s){ s=Math.max(0,Math.round(s)); return (s/60|0)+':'+('0'+(s%60)).slice(-2); }
  function markSlide(){ tSlide=performance.now(); }
  function tickTimer(){
    if(!tOn) return;
    var now=performance.now();
    var total=(now-tStart)/1000, slide=(now-tSlide)/1000;
    var upto=0; for(var i=0;i<cur&&i<TARGET.length;i++) upto+=TARGET[i];
    var tgt=TARGET[cur]||0, delta=total-(upto+Math.min(slide,tgt));
    tEl.innerHTML='slide '+(cur+1)+' &nbsp;<b>'+mmss(slide)+'</b> / '+mmss(tgt)+'<br>'+
      'total &nbsp;<b>'+mmss(total)+'</b> / 14:52<br>'+
      '<span class="'+(slide>tgt?'over':'ok')+'">'+(slide>tgt?'over by '+mmss(slide-tgt):'on target')+'</span>';
    tRaf=requestAnimationFrame(tickTimer);
  }

  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'||e.key==='ArrowDown'){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'||e.key==='ArrowUp'){ e.preventDefault(); prev(); }
    else if(e.key==='Home'){ go(0); }
    else if(e.key==='End'){ go(MAIN-1); }
    else if(e.key.toLowerCase()==='f'){ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    else if(e.key.toLowerCase()==='s'){ document.getElementById('script').classList.toggle('on'); }
    else if(e.key.toLowerCase()==='o'){ ov.classList.toggle('on'); }
    else if(e.key.toLowerCase()==='t'){
      tOn=!tOn; tEl.classList.toggle('on',tOn);
      if(tOn){ tStart=performance.now(); markSlide(); tickTimer(); } else cancelAnimationFrame(tRaf);
    }
    else if(e.key==='Escape'){ ov.classList.remove('on'); }
  });
  stage.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('video')) return; var x=e.clientX/window.innerWidth; if(x>0.62) next(); else if(x<0.32) prev(); });

  var start=parseInt(location.hash.replace('#',''),10);
  cur=(start>=1&&start<=N)?start-1:0;
  step=Math.min(1,+slides[cur].dataset.steps||0);
  slides[cur].classList.add('is-active');
  renderSteps(); updateChrome(); onEnter(cur); markSlide();
})();
</script>
