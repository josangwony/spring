// =============================================================
// APS 자동 계획 알고리즘 (순수 함수 모듈)
// HTML 단일 파일에서 분리 — 단위 테스트와 회귀 방지를 위해 모듈화
// 모든 함수는 외부 state를 변경하지 않는 순수 함수
// =============================================================

// 그룹 스펙 기본값 (강선/높이/부직포는 사용자 입력 전엔 null, lines는 기존 EQUIP_A 기반)
const GROUP_SPEC_DEFAULT={
  '일룸 1조닝':  {wire:null,height:null,fabric:null,lines:['A']},
  '일룸 키즈':   {wire:null,height:null,fabric:null,lines:['A']},
  '이브닝':      {wire:null,height:null,fabric:null,lines:['A']},
  '쿠시노':      {wire:null,height:null,fabric:null,lines:['B']},
  '헤이븐 180':  {wire:null,height:null,fabric:null,lines:['B']},
  '헤이븐 140':  {wire:null,height:null,fabric:null,lines:['B']},
  '헤이븐 빌트인':{wire:null,height:null,fabric:null,lines:['B']},
  '슬로우 1조닝':{wire:null,height:null,fabric:null,lines:['B']},
  '슬로우 7조닝':{wire:null,height:null,fabric:null,lines:['B']},
  '모션 스프링': {wire:null,height:null,fabric:null,lines:['B']},
  '스탠다드':    {wire:null,height:null,fabric:null,lines:['B']},
};
const GROUP_LIST=Object.keys(GROUP_SPEC_DEFAULT);
// 그룹 스펙 드롭다운 옵션
const SPEC_OPTIONS={
  wire:['경강선','스테인리스선','큐알루마선'],
  height:['100mm','140mm','180mm'],
  fabric:['스판본드','니들펀칭'],
};
const SPEC_LABEL={wire:'강선',height:'높이',fabric:'부직포'};

// === 코일러 안정화(형상 잡는 시간) ===
// 코일러 1개 변경 = 60분(기본). 그룹 페어별 코일러 변경 개수 매트릭스 (기본 3, 일부 공유 페어만 별도)
const COILER_DIFF_PAIRS={
  '슬로우 1조닝||슬로우 7조닝':2, // 1개 공유, 2개 변경
};
const COILER_PER_CHANGE_MIN=60;
const COILER_DIFF_DEFAULT=3;
function coilerChangeTime(g1,g2,coilerMin){
  if(!g1||!g2||g1===g2)return 0;
  const k1=g1+'||'+g2,k2=g2+'||'+g1;
  const diff=COILER_DIFF_PAIRS[k1]!=null?COILER_DIFF_PAIRS[k1]:(COILER_DIFF_PAIRS[k2]!=null?COILER_DIFF_PAIRS[k2]:COILER_DIFF_DEFAULT);
  const per=(typeof coilerMin==='number'&&coilerMin>=0)?coilerMin:COILER_PER_CHANGE_MIN;
  return diff*per;
}
// 교체 시간 산출: 강선/높이/부직포 비트마스크 + 코일러 안정화
function changeoverTime(g1,g2,spec,coilerMin){
  if(!g1||!g2||g1===g2)return 0;
  const sp=spec||GROUP_SPEC_DEFAULT;
  const s1=sp[g1],s2=sp[g2];
  if(!s1||!s2)return 60+coilerChangeTime(g1,g2,coilerMin); // fallback (게이트가 막아주지만 안전장치)
  const w=s1.wire!==s2.wire,h=s1.height!==s2.height,f=s1.fabric!==s2.fabric;
  const k=(w?4:0)+(h?2:0)+(f?1:0);
  // k 인덱스별 시간: [모두같음, f만, h만, h+f, w만, w+f, w+h, w+h+f]
  const specMin=[0,30,60,90,30,60,90,120][k];
  return specMin+coilerChangeTime(g1,g2,coilerMin);
}
// 그룹 스펙 미입력(null) 그룹 추출 — 시뮬 게이트용
function getMissingSpecGroups(spec){
  const sp=spec||GROUP_SPEC_DEFAULT;
  const missing=[];
  GROUP_LIST.forEach(g=>{
    const s=sp[g];
    if(!s)return;
    const fields=[];
    if(s.wire==null||s.wire==='')fields.push('강선');
    if(s.height==null||s.height==='')fields.push('높이');
    if(s.fabric==null||s.fabric==='')fields.push('부직포');
    if(fields.length>0)missing.push({group:g,fields});
  });
  return missing;
}

// === 매핑 → 스프링 데이터 산출 ===
const SIZE_ORDER={'S':0,'SS':1,'D':2,'Q':3,'K':4,'KK':5};
function getSizeKey(name){
  const m=name.match(/\b(KK|SS|S|D|Q|K)\b|\((KK|SS|S|D|Q|K)\)/);
  if(m)return m[1]||m[2];
  if(name.includes('KK'))return 'KK';if(name.includes('SS'))return 'SS';
  if(name.includes('(K)'))return 'K';if(name.includes('(Q)'))return 'Q';if(name.includes('(S)'))return 'S';
  if(name.endsWith(' K'))return 'K';if(name.endsWith(' Q'))return 'Q';if(name.endsWith(' S'))return 'S';
  return 'Z';
}
function inferGroup(n){
  if(!n)return '기타';
  if(n.includes('모션'))return '모션 스프링';
  if(n.includes('빌트인'))return '헤이븐 빌트인';
  if(n.includes('H140')||(n.includes('헤이븐')&&n.includes('140')))return '헤이븐 140';
  if(n.includes('헤이븐')||(n.includes('AL-CU')&&!n.includes('140')))return '헤이븐 180';
  if(n.includes('쿠시노'))return '쿠시노';
  if(n.includes('키즈'))return '일룸 키즈';
  if(n.includes('7조닝'))return '슬로우 7조닝';
  if(n.includes('슬로우')||n.includes('1조닝 스프링'))return '슬로우 1조닝';
  if(n.includes('이브닝'))return '이브닝';
  if(n.includes('일룸')||n.includes('1조닝'))return '일룸 1조닝';
  if(n.includes('스탠다드')||n.includes('플렉서블'))return '스탠다드';
  return '기타';
}
function buildSD(map){
  const sd={};
  Object.values(map).forEach(v=>{
    const sc=v.sc;
    if(!sc)return;
    const sn=v.sn||'';
    const g=v.sg||(sn?inferGroup(sn):'기타');
    if(!sd[sc])sd[sc]={n:sn||sc,g};
  });
  return sd;
}
function buildCodes(sd){
  const groups=[...new Set(Object.values(sd).map(s=>s.g))].sort((a,b)=>a.localeCompare(b,'ko'));
  const codes=Object.keys(sd).sort((a,b)=>{
    const ga=sd[a].g,gb=sd[b].g;
    if(ga!==gb)return groups.indexOf(ga)-groups.indexOf(gb);
    const sa=SIZE_ORDER[getSizeKey(sd[a].n)]??9,sb=SIZE_ORDER[getSizeKey(sd[b].n)]??9;
    return sa-sb;
  });
  return {sd,codes,groups};
}

// === 자동 계획 시뮬레이터 알고리즘 ===
const LINE_MIN_PER_DAY=430;

function getLineForGroup(group,groupSpec){
  const sp=groupSpec||GROUP_SPEC_DEFAULT;
  const s=sp[group]||GROUP_SPEC_DEFAULT[group];
  return (s&&s.lines&&s.lines[0])||'B';
}
function dateToYMD(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function buildDateRange(start,end){
  const r=[];let c=new Date(start);const e=new Date(end);
  while(c<=e){r.push(dateToYMD(c));c.setDate(c.getDate()+1)}
  return r;
}

// capacity 정규화: 단일 number(구버전) 또는 {A,B} 객체 → 항상 {A,B} 객체로 변환
function normalizeCapacity(v){
  if(v&&typeof v==='object'&&typeof v.A==='number'&&typeof v.B==='number')return v;
  if(typeof v==='number'&&v>0)return {A:Math.round(v/2),B:v-Math.round(v/2)};
  return {A:130,B:130};
}
function totalCapacity(c){const n=normalizeCapacity(c);return n.A+n.B}

// 시작일 이전 미반영 mp 잔여량 산출
// mp[c][d] - Σ completedCards[c_d_*].qty (AB 분할의 라인별 완료를 모두 차감)
function mpRemainingQty(mp,completedCards,code,date){
  const v=mp&&mp[code]?mp[code][date]:undefined;
  const mpQty=typeof v==='object'?(v&&v.qty||0):(v||0);
  if(mpQty<=0)return 0;
  let doneQty=0;
  if(completedCards){
    const prefix=code+'_'+date+'_';
    Object.keys(completedCards).forEach(k=>{
      if(k.indexOf(prefix)===0){
        const cc=completedCards[k];
        doneQty+=(cc&&cc.qty)||0;
      }
    });
  }
  return Math.max(0,mpQty-doneQty);
}

// 부족 이벤트 추출
// 시작재고 = inv + (시뮬 시작일 이전의 "미완료 mp" 잔여) - (시뮬 시작일 이전의 plan 출고)
// priority='real' (재고<0, 출고 펑크) — 절대 우선
// priority='safety' (0≤재고<안전재고선) — 후순위
function extractShortages(inv,plan,codes,sd,dates,safetyDays,springMonthlyAvg,mp,completedCards){
  const shortages=[];
  const simStart=dates[0];
  codes.forEach(c=>{
    const monthly=springMonthlyAvg[c]||0;
    const planTotal=(plan[c]||[]).reduce((a,b)=>a+b.qty,0);
    if(monthly<=0&&planTotal<=0)return;
    // 안전재고는 영업일 기준 (주 5일 × 약 4.2주 = 21일)
    const dailyAvg=monthly/21;
    const safetyLine=safetyDays*dailyAvg;
    let run=inv[c]||0;
    // 시뮬 시작일 이전: 미완료 mp(미반영 생산) 가산
    if(mp&&mp[c]){
      Object.keys(mp[c]).forEach(d=>{
        if(d>=simStart)return;
        run+=mpRemainingQty(mp,completedCards,c,d);
      });
    }
    // 시뮬 시작일 이전: plan 출고 차감
    (plan[c]||[]).forEach(p=>{if(p.date<simStart)run-=p.qty});
    for(const d of dates){
      const out=(plan[c]||[]).filter(p=>p.date===d).reduce((a,b)=>a+b.qty,0);
      run-=out;
      // 1. 진짜 부족 (재고 마이너스 = 출고 펑크): 절대 우선
      if(run<0){
        shortages.push({code:c,group:sd[c]?sd[c].g:'기타',dueDate:d,qty:Math.ceil(-run),priority:'real'});
        run=0;
      }
      // 2. 안전재고 미달 (0 이상이지만 라인 미달): 후순위
      if(run<safetyLine){
        const need=Math.ceil(safetyLine-run);
        if(need>0){
          shortages.push({code:c,group:sd[c]?sd[c].g:'기타',dueDate:d,qty:need,priority:'safety'});
          run=safetyLine;
        }
      }
    }
  });
  return shortages;
}
// 부족 이벤트를 일자별 라인 스케줄에 배치 (시나리오 공통 코어)
// orderedShortages: 시나리오별 정렬된 부족 이벤트 배열
// capacity: {A,B} 라인별 일 capacity (개/일)
// holidays: [{date,memo}] 사업장 월력 휴무일 (토/일은 항상 자동 휴일)
// initialGroups: {A,B} 시뮬 시작일 이전 진행 중이던 라인별 그룹. 첫 작업의 교체시간 계산에 사용.
function placeShortages(orderedShortages,dates,capacity,groupSpec,coilerMin,holidays,initialGroups){
  const cap=normalizeCapacity(capacity);
  const holidaySet=new Set((holidays||[]).map(h=>h.date));
  function isWorkday(d){
    const day=new Date(d).getDay();
    if(day===0||day===6)return false; // 토/일
    if(holidaySet.has(d))return false; // 사업장 휴무일
    return true;
  }
  const schedule={A:{},B:{}};
  dates.forEach(d=>{schedule.A[d]={items:[],usedMin:0};schedule.B[d]={items:[],usedMin:0}});
  const minPerUnitA=LINE_MIN_PER_DAY/Math.max(1,cap.A);
  const minPerUnitB=LINE_MIN_PER_DAY/Math.max(1,cap.B);
  const shortagesLeft=[];
  function getPrevGroup(line,dateIdx){
    for(let i=dateIdx;i>=0;i--){
      const its=schedule[line][dates[i]].items;
      if(its.length>0)return its[its.length-1].group;
    }
    return initialGroups?(initialGroups[line]||null):null;
  }
  function placeOnDay(line,dateIdx,group,code,want){
    const d=dates[dateIdx];
    if(!isWorkday(d))return 0; // 주말/휴무일 거부
    const day=schedule[line][d];
    const lastIt=day.items.length>0?day.items[day.items.length-1]:null;
    const lastG=lastIt?lastIt.group:getPrevGroup(line,dateIdx-1);
    const isNewGroup=lastG!==group;
    const co=isNewGroup?changeoverTime(lastG,group,groupSpec,coilerMin):0;
    const remainMin=LINE_MIN_PER_DAY-day.usedMin-co;
    if(remainMin<=0)return 0;
    const minPerUnit=line==='A'?minPerUnitA:minPerUnitB;
    const canMake=Math.floor(remainMin/minPerUnit);
    // 10단위로 floor — 10 미만 capacity는 다음 날로 넘김 (마지막 fallback에서 잔업 처리)
    const canMake10=Math.floor(canMake/10)*10;
    if(canMake10<=0)return 0;
    const make=Math.min(canMake10,want);
    day.items.push({code,group,qty:make,changeoverMin:co});
    day.usedMin+=co+make*minPerUnit;
    return make;
  }
  // 잔업 강제 배치: capacity 무시하고 dueDate 가까운 영업일에 한 번에 배치 (10단위 유지)
  function placeOvertime(line,dueIdx,group,code,qty){
    // dueIdx부터 거꾸로 가장 가까운 영업일 찾고, 없으면 앞으로 진행
    let target=-1;
    for(let di=dueIdx;di>=0;di--){if(isWorkday(dates[di])){target=di;break}}
    if(target<0){for(let di=dueIdx+1;di<dates.length;di++){if(isWorkday(dates[di])){target=di;break}}}
    if(target<0)return 0;
    const day=schedule[line][dates[target]];
    const lastIt=day.items.length>0?day.items[day.items.length-1]:null;
    const lastG=lastIt?lastIt.group:getPrevGroup(line,target-1);
    const isNewGroup=lastG!==group;
    const co=isNewGroup?changeoverTime(lastG,group,groupSpec,coilerMin):0;
    const minPerUnit=line==='A'?minPerUnitA:minPerUnitB;
    day.items.push({code,group,qty,changeoverMin:co});
    day.usedMin+=co+qty*minPerUnit;
    return qty;
  }
  orderedShortages.forEach(s=>{
    const line=getLineForGroup(s.group,groupSpec);
    const dueIdx=dates.indexOf(s.dueDate);
    if(dueIdx<0){shortagesLeft.push({...s});return}
    // 생산 단위 10개씩 (부족량을 10의 배수로 올림)
    let remaining=Math.ceil(s.qty/10)*10;
    // 1단계: dueDate-1일부터 거꾸로 (납기 보호, 10단위 capacity 내에서)
    for(let di=Math.max(0,dueIdx-1);di>=0&&remaining>0;di--){
      remaining-=placeOnDay(line,di,s.group,s.code,remaining);
    }
    // 2단계: 안 되면 dueDate 이후로 밀어냄 (납기 위반, 10단위 capacity 내에서)
    for(let di=dueIdx;di<dates.length&&remaining>0;di++){
      remaining-=placeOnDay(line,di,s.group,s.code,remaining);
    }
    // 3단계: 모든 영업일이 10단위 capacity 부족이면 잔업으로 강제 배치 (capacity 초과 허용)
    if(remaining>0){
      remaining-=placeOvertime(line,dueIdx,s.group,s.code,remaining);
    }
    if(remaining>0)shortagesLeft.push({...s,qty:remaining});
  });
  return {schedule,shortagesLeft};
}
// 같은 코드의 부족분을 첫 dueDate 기준으로 합산.
// priority는 real 우선 (real이 하나라도 있으면 통합 결과는 real, dueDate는 가장 빠른 것)
function consolidateByCode(shortages){
  const byCode={};
  shortages.forEach(s=>{
    if(!byCode[s.code]){byCode[s.code]={...s};return}
    byCode[s.code].qty+=s.qty;
    if(s.dueDate<byCode[s.code].dueDate)byCode[s.code].dueDate=s.dueDate;
    if(s.priority==='real')byCode[s.code].priority='real';
  });
  return Object.values(byCode);
}
// priority 분리 헬퍼: real 부족 먼저, safety 부족 나중
function splitByPriority(shortages){
  return [shortages.filter(s=>s.priority==='real'),shortages.filter(s=>s.priority!=='real')];
}
// 시나리오 ① 납기 우선 (개별 부족 그대로, real 먼저)
function runDueDateFirst(shortages,dates,capacity,groupSpec,coilerMin,holidays,initialGroups){
  const [real,safety]=splitByPriority(shortages);
  const sortByDue=arr=>[...arr].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  return placeShortages([...sortByDue(real),...sortByDue(safety)],dates,capacity,groupSpec,coilerMin,holidays,initialGroups);
}
// 그룹 묶음 정렬 헬퍼 (시나리오 ②③ 공통)
function orderByGroupCluster(shortages,dates){
  const consolidated=consolidateByCode(shortages);
  const byGroup={};
  consolidated.forEach(s=>{(byGroup[s.group]=byGroup[s.group]||[]).push(s)});
  const groupKeys=Object.keys(byGroup).sort((ga,gb)=>{
    const minA=Math.min(...byGroup[ga].map(s=>dates.indexOf(s.dueDate)));
    const minB=Math.min(...byGroup[gb].map(s=>dates.indexOf(s.dueDate)));
    return minA-minB;
  });
  const ordered=[];
  groupKeys.forEach(g=>{
    byGroup[g].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    byGroup[g].forEach(s=>ordered.push(s));
  });
  return ordered;
}
// 시나리오 ② 교체 최소: 같은 코드는 real/safety 무관하게 먼저 통합(real 우선)해
// 같은 셋업에서 한 번에 생산되도록 함. 그 후 real 먼저(그룹 묶음) → safety 나중(그룹 묶음).
function runChangeoverMin(shortages,dates,capacity,groupSpec,coilerMin,holidays,initialGroups){
  const merged=consolidateByCode(shortages);
  const [real,safety]=splitByPriority(merged);
  return placeShortages([...orderByGroupCluster(real,dates),...orderByGroupCluster(safety,dates)],dates,capacity,groupSpec,coilerMin,holidays,initialGroups);
}
// 시나리오 ③ 중간: real 먼저(alpha 가중) → safety 나중(alpha 가중)
function runBalanced(shortages,dates,capacity,groupSpec,alpha,coilerMin,holidays,initialGroups){
  const [real,safety]=splitByPriority(shortages);
  function balanceSort(arr){
    const consolidated=consolidateByCode(arr);
    const byGroup={};
    consolidated.forEach(s=>{(byGroup[s.group]=byGroup[s.group]||[]).push(s)});
    const groupRank={};
    Object.keys(byGroup).forEach(g=>{
      groupRank[g]=Math.min(...byGroup[g].map(s=>dates.indexOf(s.dueDate)));
    });
    return [...consolidated].sort((a,b)=>{
      const ka=alpha*dates.indexOf(a.dueDate)+(1-alpha)*groupRank[a.group]*1000;
      const kb=alpha*dates.indexOf(b.dueDate)+(1-alpha)*groupRank[b.group]*1000;
      if(ka!==kb)return ka-kb;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }
  return placeShortages([...balanceSort(real),...balanceSort(safety)],dates,capacity,groupSpec,coilerMin,holidays,initialGroups);
}
// 편집된 schedule에서 부족 이벤트 재산출 (편집 후 메트릭 재계산용)
function recomputeShortagesLeft(schedule,shortages,dates){
  return shortages.map(s=>{
    let produced=0;
    for(const d of dates){
      if(d>s.dueDate)break;
      ['A','B'].forEach(line=>{
        schedule[line][d].items.forEach(it=>{if(it.code===s.code)produced+=it.qty});
      });
    }
    return produced<s.qty?{...s,qty:s.qty-produced}:null;
  }).filter(Boolean);
}
// 일자별 capacity 초과일 카운트 (라인별 합 vs 라인별 capacity)
function countCapacityExceedDays(schedule,dates,capacity){
  const cap=normalizeCapacity(capacity);
  let count=0;
  dates.forEach(d=>{
    const aTotal=schedule.A[d].items.reduce((a,it)=>a+it.qty,0);
    const bTotal=schedule.B[d].items.reduce((a,it)=>a+it.qty,0);
    if(aTotal>cap.A||bTotal>cap.B)count++;
  });
  return count;
}
// 시나리오 결과 메트릭 (priority 분리: 납기 준수율은 real만, 안전재고 충족률은 safety만)
// initialGroups: {A,B} 시뮬 직전 진행 그룹. 첫 작업이 다른 그룹이면 교체 1회로 카운트.
function computeScenarioMetrics(result,shortages,initialGroups){
  const {schedule,shortagesLeft}=result;
  let changeoverCount=0,changeoverMin=0,totalProduced=0;
  ['A','B'].forEach(line=>{
    let prevG=initialGroups?(initialGroups[line]||null):null;
    Object.keys(schedule[line]).sort().forEach(d=>{
      schedule[line][d].items.forEach(it=>{
        if(prevG&&prevG!==it.group){changeoverCount++;changeoverMin+=it.changeoverMin||0}
        totalProduced+=it.qty;
        prevG=it.group;
      });
    });
  });
  const realNeeded=shortages.filter(s=>s.priority==='real').reduce((a,b)=>a+b.qty,0);
  const realShort=shortagesLeft.filter(s=>s.priority==='real').reduce((a,b)=>a+b.qty,0);
  const safetyNeeded=shortages.filter(s=>s.priority!=='real').reduce((a,b)=>a+b.qty,0);
  const safetyShort=shortagesLeft.filter(s=>s.priority!=='real').reduce((a,b)=>a+b.qty,0);
  const onTimeRate=realNeeded>0?(realNeeded-realShort)/realNeeded:1; // 진짜 출고 펑크 기준
  const safetyRate=safetyNeeded>0?(safetyNeeded-safetyShort)/safetyNeeded:1; // 안전재고 미달 기준
  const totalNeeded=realNeeded+safetyNeeded;
  const totalShort=realShort+safetyShort;
  return {changeoverCount,changeoverMin,totalProduced,onTimeRate,safetyRate,totalShort,totalNeeded,realNeeded,realShort,safetyNeeded,safetyShort};
}
// schedule(라인별 일자별 items)을 mp 객체(코드별 일자별 qty)로 변환
function scheduleToMp(schedule,dates){
  const mp={};
  dates.forEach(d=>{
    ['A','B'].forEach(line=>{
      schedule[line][d].items.forEach(it=>{
        if(!mp[it.code])mp[it.code]={};
        mp[it.code][d]=(mp[it.code][d]||0)+it.qty;
      });
    });
  });
  return mp;
}
// 시뮬 시작일 직전 영업일의 라인별 마지막 그룹 추출 (첫 작업의 교체시간 계산용)
// mp + lineOverride를 역행하며 가장 가까운 작업일을 찾아 그 날 라인별 그룹 set 중 코드 정렬 마지막을 채택(결정적)
// AB 분할 항목은 양 라인 모두에 카운트
function computeInitialGroups(mp,lineOverride,sd,simStartDate,holidays,groupSpec){
  const result={A:null,B:null};
  const holidaySet=new Set((holidays||[]).map(h=>h.date));
  function isWorkday(d){
    const day=new Date(d).getDay();
    if(day===0||day===6)return false;
    if(holidaySet.has(d))return false;
    return true;
  }
  function defaultLine(code){
    const g=sd&&sd[code]?sd[code].g:null;
    return g?getLineForGroup(g,groupSpec):'B';
  }
  function getLineFor(code,date){
    const ov=lineOverride?lineOverride[code+'_'+date]:null;
    if(!ov)return defaultLine(code);
    return typeof ov==='object'?ov.line:ov;
  }
  // 시작일에서 최대 90일 거꾸로 — 라인별로 채워지면 종료
  const start=new Date(simStartDate);
  for(let i=1;i<=90&&(!result.A||!result.B);i++){
    const dt=new Date(start);dt.setDate(dt.getDate()-i);
    const d=dateToYMD(dt);
    if(!isWorkday(d))continue;
    const onLine={A:[],B:[]};
    Object.keys(mp||{}).forEach(c=>{
      const v=(mp[c]||{})[d];
      const qty=typeof v==='object'?(v&&v.qty||0):(v||0);
      if(qty<=0)return;
      const line=getLineFor(c,d);
      if(line==='A'||line==='B')onLine[line].push(c);
      else if(line==='AB'){onLine.A.push(c);onLine.B.push(c)}
    });
    ['A','B'].forEach(line=>{
      if(result[line])return;
      if(onLine[line].length===0)return;
      onLine[line].sort();
      const lastCode=onLine[line][onLine[line].length-1];
      result[line]=sd&&sd[lastCode]?sd[lastCode].g:null;
    });
  }
  return result;
}

// schedule을 lineOverride 객체로 변환 (시뮬 영역만)
function scheduleToLineOverride(schedule,dates){
  const ov={};
  dates.forEach(d=>{
    ['A','B'].forEach(line=>{
      schedule[line][d].items.forEach(it=>{
        ov[it.code+'_'+d]=line;
      });
    });
  });
  return ov;
}
