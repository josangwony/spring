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
// 강선/높이/부직포가 모두 같으면(같은 super-cluster) 운영상 setup 0 — 코일러 변경 무시
function changeoverTime(g1,g2,spec,coilerMin){
  if(!g1||!g2||g1===g2)return 0;
  const sp=spec||GROUP_SPEC_DEFAULT;
  const s1=sp[g1],s2=sp[g2];
  if(!s1||!s2)return 60+coilerChangeTime(g1,g2,coilerMin); // fallback (게이트가 막아주지만 안전장치)
  const w=s1.wire!==s2.wire,h=s1.height!==s2.height,f=s1.fabric!==s2.fabric;
  if(!w&&!h&&!f)return 0; // 같은 super-cluster — 운영상 setup 0 (코일러 변경 시간도 미반영)
  const k=(w?4:0)+(h?2:0)+(f?1:0);
  // k 인덱스별 시간: [모두같음, f만, h만, h+f, w만, w+f, w+h, w+h+f]
  const specMin=[0,30,60,90,30,60,90,120][k];
  return specMin+coilerChangeTime(g1,g2,coilerMin);
}
// 그룹의 셋업 키 — 강선/높이/부직포 모두 같으면 같은 super-cluster. 코일러 변경은 setup 분에 포함되지만 super-cluster 묶음 기준에는 미반영.
function getSetupKey(group,spec){
  const sp=spec||GROUP_SPEC_DEFAULT;
  const s=sp[group];
  if(!s)return group; // 스펙 없으면 자기 자신만 cluster (안전장치)
  return (s.wire||'')+'|'+(s.height||'')+'|'+(s.fabric||'');
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

// 안전재고 제한 그룹: 자주 교체 걸리는 그룹은 메인 사이즈(SS)만 안전재고 유지
// 그 외 사이즈는 real(실제 출고 펑크)만 처리 — 모든 사이즈 안전재고 시 재고 과잉 방지
// 제한 그룹에 없는 그룹(헤이븐/키즈/슬로우/모션 등)은 모든 사이즈 안전재고 유지
const SAFETY_LIMITED_GROUPS={
  '쿠시노':['SS'],
  '이브닝':['SS'],
  '일룸 1조닝':['SS'],
};
function shouldApplySafety(group,code,sd){
  const limited=SAFETY_LIMITED_GROUPS[group];
  if(!limited)return true; // 제한 없는 그룹 → 모든 사이즈 안전재고 적용
  const name=sd&&sd[code]?sd[code].n:'';
  const sk=getSizeKey(name);
  return limited.indexOf(sk)>=0; // 제한 그룹은 명시된 사이즈만
}

// 부족 이벤트 추출
// 시작재고 = inv + (시뮬 시작일 이전의 "미완료 mp" 잔여) - (시뮬 시작일 이전의 plan 출고)
// priority='real' (재고<0, 출고 펑크): 매번 발생 시점에 push (한 시뮬 안에 여러 번 가능)
// priority='safety' (0≤재고<안전재고선): SAFETY_TARGETS 에 등록된 그룹·사이즈만 시뮬 끝 시점 미달분 1회 push
//                                       그 외 그룹·사이즈는 safety 무시 (실제 필요량만 투입)
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
    const cGroup=sd[c]?sd[c].g:'기타';
    const applySafety=shouldApplySafety(cGroup,c,sd);
    let firstSafetyMiss=null;
    for(const d of dates){
      const out=(plan[c]||[]).filter(p=>p.date===d).reduce((a,b)=>a+b.qty,0);
      run-=out;
      // 1. 진짜 부족 (재고 마이너스 = 출고 펑크): 매번 push
      if(run<0){
        shortages.push({code:c,group:cGroup,dueDate:d,qty:Math.ceil(-run),priority:'real'});
        run=0;
      }
      // 2. 첫 안전재고선 미달 일자 기록 (push 는 시뮬 끝에서 1회) — applySafety 인 코드만
      if(applySafety&&run<safetyLine&&!firstSafetyMiss)firstSafetyMiss=d;
    }
    // safety 부족: applySafety 인 코드만 시뮬 끝 시점 미달분 1회 push
    if(applySafety&&run<safetyLine){
      const need=Math.ceil(safetyLine-run);
      if(need>0){
        shortages.push({code:c,group:cGroup,dueDate:firstSafetyMiss||dates[dates.length-1],qty:need,priority:'safety'});
      }
    }
  });
  return shortages;
}
// 부족 이벤트를 일자별 라인 스케줄에 배치 (시나리오 공통 코어)
// orderedShortages: 시나리오별 정렬된 부족 이벤트 배열
// capacity: {A,B} 라인별 일 capacity (개/일)
// holidays: [{date,memo}] 사업장 월력 휴무일 (토/일은 항상 자동 휴일)
// 그룹 블록 배치 (Group-Block Placement)
// - 같은 그룹은 같은 라인의 연속 영업일에 통째로 점유
// - 그룹이 바뀌면 cursor를 다음 빈 영업일로 강제 이동 → 한 라인 한 날에 두 그룹 섞이지 않음
// - 채울 수 없는 부족은 shortagesLeft 에 reason / blockingDates 와 함께 기록
// orderedShortages: 라인 무관 단일 배열, 같은 그룹은 연속해서 등장한다고 가정 (runChangeoverMin 에서 그룹 묶음 정렬)
// initialGroups: {A,B} 시뮬 시작일 이전 진행 그룹. 첫 그룹과 같으면 setup 0
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
  const minPerUnit={A:LINE_MIN_PER_DAY/Math.max(1,cap.A),B:LINE_MIN_PER_DAY/Math.max(1,cap.B)};
  const shortagesLeft=[];

  // 라인별로 부족 분리 (입력 순서 유지: 같은 그룹은 연속해서 등장)
  const byLine={A:[],B:[]};
  orderedShortages.forEach(s=>{
    const line=getLineForGroup(s.group,groupSpec);
    byLine[line].push(s);
  });

  function summarizeReason(trace){
    if(!trace||trace.length===0)return {reason:'unknown',blockingDates:[]};
    const counts={};
    trace.forEach(t=>{counts[t.reason]=(counts[t.reason]||0)+1});
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
    const blockingDates=[...new Set(trace.filter(t=>t.reason===top).map(t=>t.date))].sort();
    return {reason:top,blockingDates};
  }

  ['A','B'].forEach(line=>{
    const arr=byLine[line];
    let prev=initialGroups?(initialGroups[line]||null):null;
    let cursor=0;
    let qi=0;
    const mpu=minPerUnit[line];
    while(qi<arr.length){
      const startSuperKey=getSetupKey(arr[qi].group,groupSpec);
      const group=arr[qi].group;
      const isNewGroup=group!==prev;
      // 새 그룹이지만 같은 super-cluster(강선·높이·부직포 동일) 이면 같은 날 이어서 가능 — advance 안 함
      // 다른 super-cluster 면 cursor 를 비어있는 영업일까지 advance
      if(isNewGroup&&prev!==null){
        const sameCluster=getSetupKey(prev,groupSpec)===startSuperKey;
        if(!sameCluster){
          while(cursor<dates.length){
            const d=dates[cursor];
            if(!isWorkday(d)){cursor++;continue}
            if(schedule[line][d].usedMin>0){cursor++;continue} // 이전 cluster 가 그날을 점유
            break;
          }
        }
      }
      // 같은 super-cluster 의 모든 부족(여러 그룹 포함)을 한 묶음으로 라운드 로빈 처리
      // 같은 cluster 안 그룹들은 setup 0 이라 같은 날 자유 합류 가능 → 매일 다같이 분배
      let qj=qi;
      while(qj<arr.length&&getSetupKey(arr[qj].group,groupSpec)===startSuperKey)qj++;
      const groupItems=arr.slice(qi,qj);
      const remainings=groupItems.map(it=>Math.ceil(it.qty/10)*10);
      const traces=groupItems.map(()=>[]);
      while(true){
        const activeIdxs=remainings.map((r,i)=>r>0?i:-1).filter(i=>i>=0);
        if(activeIdxs.length===0)break;
        if(cursor>=dates.length)break;
        const d=dates[cursor];
        if(!isWorkday(d)){
          activeIdxs.forEach(i=>traces[i].push({date:d,reason:'holiday'}));
          cursor++;continue;
        }
        const day=schedule[line][d];
        let firstWorkOnDay=day.items.length===0;
        let dayMadeAny=false;
        let setupApplied=false;
        // 같은 cursor 에서 활성 부족 순서대로(qty asc) 처리 — 작은 부족 다 끝내고 잔여 capacity 를 큰 부족에
        for(let ord=0;ord<activeIdxs.length;ord++){
          const i=activeIdxs[ord];
          const itemGroup=groupItems[i].group;
          let setup=0;
          if(!setupApplied&&firstWorkOnDay&&itemGroup!==prev){
            setup=changeoverTime(prev,itemGroup,groupSpec,coilerMin);
            setupApplied=true;
          }
          const remainMin=LINE_MIN_PER_DAY-day.usedMin-setup;
          if(remainMin<=0){
            traces[i].push({date:d,reason:setup>0?'setup_conflict':'capacity_full'});
            continue;
          }
          const canMake=Math.floor(remainMin/mpu);
          const canMake10=Math.floor(canMake/10)*10;
          if(canMake10<10){
            traces[i].push({date:d,reason:'capacity_under10'});
            continue;
          }
          // 부족 1건이 한 번에 다 만들 수 있으면 다 만듬. 못 만들면 잔여만큼만
          const make=Math.min(canMake10,remainings[i]);
          if(make<10){
            traces[i].push({date:d,reason:'capacity_under10'});
            continue;
          }
          day.items.push({code:groupItems[i].code,group:itemGroup,qty:make,changeoverMin:setup});
          day.usedMin+=setup+make*mpu;
          remainings[i]-=make;
          prev=itemGroup;
          dayMadeAny=true;
          firstWorkOnDay=false;
        }
        cursor++;
      }
      // 남은 부족 shortagesLeft. trace 비어있음 = 선순위 cluster 가 cursor 를 다 점유해 시도조차 못 함
      groupItems.forEach((it,i)=>{
        if(remainings[i]>0){
          if(traces[i].length===0){
            shortagesLeft.push({...it,qty:remainings[i],line,reason:'blocked_by_prior',blockingDates:[]});
          }else{
            const summary=summarizeReason(traces[i]);
            shortagesLeft.push({...it,qty:remainings[i],line,reason:summary.reason,blockingDates:summary.blockingDates});
          }
        }
      });
      qi=qj;
    }
  });

  return {schedule,shortagesLeft};
}
// 같은 코드의 부족분을 통합.
// priority: real 우선 (real이 하나라도 있으면 통합 priority='real')
// dueDate 산정 규칙:
//   - real 부족이 하나라도 있으면 → real 중 가장 빠른 dueDate (실제 출고 펑크 시점)
//   - real이 없으면 → safety 중 가장 빠른 dueDate (안전재고 미달 시점)
//   safety의 firstSafetyMiss 가 real 보다 앞서더라도 채택하지 않음 — 진짜 펑크 우선순위 보호
function consolidateByCode(shortages){
  const byCode={};
  shortages.forEach(s=>{
    const isReal=s.priority==='real';
    if(!byCode[s.code]){byCode[s.code]={...s};return}
    const cur=byCode[s.code];
    cur.qty+=s.qty;
    const curIsReal=cur.priority==='real';
    if(isReal&&!curIsReal){
      // safety 였는데 real 추가 → real 로 격상 + dueDate 도 real 의 것 사용
      cur.priority='real';
      cur.dueDate=s.dueDate;
    }else if(isReal&&curIsReal){
      // 둘 다 real → 더 빠른 dueDate
      if(s.dueDate<cur.dueDate)cur.dueDate=s.dueDate;
    }else if(!isReal&&!curIsReal){
      // 둘 다 safety → 더 빠른 dueDate
      if(s.dueDate<cur.dueDate)cur.dueDate=s.dueDate;
    }
    // !isReal && curIsReal: real 에 safety 추가 → real 우선, dueDate 변경 X
  });
  return Object.values(byCode);
}
// priority 분리 헬퍼: real 부족 먼저, safety 부족 나중
function splitByPriority(shortages){
  return [shortages.filter(s=>s.priority==='real'),shortages.filter(s=>s.priority!=='real')];
}
// 그룹 묶음 정렬 헬퍼 (교체 최소 시나리오용)
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
// 교체 최소 시나리오 (유일 시나리오):
// 1) 같은 코드의 real/safety 부족을 consolidateByCode 로 통합 (real 우선)
// 2) 그룹을 super-cluster (강선/높이/부직포 같음) 단위로 묶음 → 다른 셋업이 사이에 끼어들지 않음
// 3) super-cluster 순서: cluster 내 가장 빠른 real dueDate → real 없으면 safety dueDate (+1e6)
// 4) super-cluster 안 그룹 순서: 그룹 내 minDueDate (real 우선)
// 5) 그룹 내 부족 순서: real(dueDate asc) → safety(dueDate asc)
// 6) placeShortages: 같은 super-cluster 안 그룹 전환은 같은 날 이어서 가능 (advance 안 함)
function runChangeoverMin(shortages,dates,capacity,groupSpec,coilerMin,holidays,initialGroups){
  const merged=consolidateByCode(shortages);
  const byGroup={};
  merged.forEach(s=>{(byGroup[s.group]=byGroup[s.group]||[]).push(s)});
  // 그룹들을 super-cluster 로 묶음 (강선/높이/부직포 동일)
  const bySuper={};
  Object.keys(byGroup).forEach(g=>{
    const key=getSetupKey(g,groupSpec);
    (bySuper[key]=bySuper[key]||[]).push(g);
  });
  function groupRank(g){
    const items=byGroup[g];
    const reals=items.filter(s=>s.priority==='real');
    if(reals.length>0)return Math.min(...reals.map(s=>dates.indexOf(s.dueDate)));
    return Math.min(...items.map(s=>dates.indexOf(s.dueDate)))+1e6;
  }
  // 그룹 / cluster tie breaker: 같은 minDueDate 면 real 부족 합이 큰 쪽 우선 (더 시급)
  function groupTotalRealQty(g){
    return byGroup[g].filter(s=>s.priority==='real').reduce((sum,s)=>sum+s.qty,0);
  }
  function clusterRank(superKey){
    let minR=Infinity;
    bySuper[superKey].forEach(g=>{const r=groupRank(g);if(r<minR)minR=r});
    return minR;
  }
  function clusterTotalRealQty(superKey){
    return bySuper[superKey].reduce((sum,g)=>sum+groupTotalRealQty(g),0);
  }
  const superKeys=Object.keys(bySuper).sort((a,b)=>{
    const rA=clusterRank(a),rB=clusterRank(b);
    if(rA!==rB)return rA-rB;
    return clusterTotalRealQty(b)-clusterTotalRealQty(a);
  });
  const ordered=[];
  superKeys.forEach(superKey=>{
    // cluster 안 모든 부족(여러 그룹)을 한 묶음으로 합쳐서 qty asc 정렬
    // 작은 부족은 한 번에 끝내고 잔여 capacity 를 다른 부족에 양보 → 큰 부족 1개가 cursor 독점 방지
    const clusterReals=[];
    const clusterSafes=[];
    bySuper[superKey].forEach(g=>{
      const items=byGroup[g];
      items.forEach(s=>{
        if(s.priority==='real')clusterReals.push(s);
        else clusterSafes.push(s);
      });
    });
    const byDueThenQty=(a,b)=>{const d=a.dueDate.localeCompare(b.dueDate);return d!==0?d:a.qty-b.qty};
    clusterReals.sort(byDueThenQty);
    clusterSafes.sort(byDueThenQty);
    ordered.push(...clusterReals,...clusterSafes);
  });
  // 진단용 — ordered 처리 순서를 콘솔에 출력 (F12 → Console)
  try{
    console.log('[APS] super-cluster keys:',superKeys);
    console.log('[APS] ordered ('+ordered.length+'):\n'+ordered.map((s,i)=>`  ${String(i+1).padStart(3,' ')}. ${s.code} / ${s.group} / ${s.priority} / due ${s.dueDate} / qty ${s.qty}`).join('\n'));
  }catch(e){}
  return placeShortages(ordered,dates,capacity,groupSpec,coilerMin,holidays,initialGroups);
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
