import {
  apiIndexPilotResources,
  apiQueryPilotResource as apiQueryPilotResourceCore,
  apiPilotRetrievalStatus as apiPilotRetrievalStatusCore,
  VECTOR_INDEX_NAME
} from "./resource-retrieval.js";

const RANKING_VERSION="hybrid-vector-lexical-v1";
const ANSWER_MODE="extractive-evidence-v1";
const STOPWORDS=new Set("a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may might more most must no not of on or our should so than that the their them then there these they this those to under up was we were what when where which who why will with would you your about after before between during each few further here once only other over same some such through too very".split(" "));
const BROWSER_HEADERS={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};

function browserJson(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...BROWSER_HEADERS,...extra}});}
function browserGuard(request){
  const length=Number(request.headers.get("Content-Length")||0);
  if(Number.isFinite(length)&&length>4096)return browserJson({ok:false,error:"Request body is too large"},413);
  const type=String(request.headers.get("Content-Type")||"").toLowerCase();
  if(!type.startsWith("application/json"))return browserJson({ok:false,error:"Content-Type must be application/json"},415);
  const site=String(request.headers.get("Sec-Fetch-Site")||"").toLowerCase();
  if(site&&!new Set(["same-origin","same-site","none"]).has(site))return browserJson({ok:false,error:"Cross-site requests are not allowed"},403);
  const origin=request.headers.get("Origin");
  if(origin){
    try{if(new URL(origin).host!==new URL(request.url).host)return browserJson({ok:false,error:"Cross-origin requests are not allowed"},403);}
    catch{return browserJson({ok:false,error:"Invalid Origin header"},400);}
  }
  return null;
}
function stem(token){
  let value=String(token||"").toLowerCase();
  if(value.length>6&&value.endsWith("ing"))value=value.slice(0,-3);
  else if(value.length>5&&value.endsWith("ies"))value=value.slice(0,-3)+"y";
  else if(value.length>5&&value.endsWith("ed"))value=value.slice(0,-2);
  else if(value.length>4&&value.endsWith("es"))value=value.slice(0,-2);
  else if(value.length>3&&value.endsWith("s"))value=value.slice(0,-1);
  return value;
}
function tokens(text){return [...new Set((String(text||"").toLowerCase().match(/[a-z0-9]+/g)||[]).map(stem).filter(value=>value.length>1&&!STOPWORDS.has(value)))];}
function tokenSet(text){return new Set(tokens(text));}
function lexicalMetrics(question,text){
  const query=tokens(question),set=tokenSet(text);
  if(!query.length)return {score:0,matched:0,query_tokens:0};
  let matched=0;
  for(const token of query)if(set.has(token))matched++;
  let score=matched/query.length;
  const lowerQuestion=String(question||"").toLowerCase();
  const lowerText=String(text||"").toLowerCase();
  for(let index=0;index<query.length-1;index++)if(lowerText.includes(query[index]+" "+query[index+1])){score+=0.08;break;}
  if(/how many|number of|required/i.test(lowerQuestion)&&/\b\d+[\d,]*(?:\.\d+)?\b/.test(lowerText))score+=0.08;
  return {score:Math.min(1,score),matched,query_tokens:query.length};
}
function jaccard(a,b){
  const left=tokenSet(a),right=tokenSet(b);
  if(!left.size||!right.size)return 0;
  let intersection=0;
  for(const token of left)if(right.has(token))intersection++;
  return intersection/(left.size+right.size-intersection);
}
function sentenceCandidates(text){
  const clean=String(text||"").replace(/\s+/g," ").trim();
  const sentences=(clean.match(/[^.!?]+(?:[.!?]+|$)/g)||[]).map(value=>value.trim()).filter(value=>value.length>=24);
  const windows=[];
  for(let index=0;index<sentences.length;index++){
    windows.push(sentences[index]);
    if(index+1<sentences.length&&sentences[index].length+sentences[index+1].length<520)windows.push(sentences[index]+" "+sentences[index+1]);
  }
  return windows;
}
function buildAnswer(question,evidence){
  let best=null;
  for(const item of evidence){
    for(const text of sentenceCandidates(item.text)){
      const lexical=lexicalMetrics(question,text);
      const containsNumber=/\b\d+[\d,]*(?:\.\d+)?\b/.test(text);
      const howMany=/how many|number of|required/i.test(question);
      const score=lexical.score+(howMany&&containsNumber?0.12:0)+(Number(item.rank_score)||0)*0.2;
      if(!best||score>best.score)best={score,text,lexical,item};
    }
  }
  const requiredMatches=best?Math.min(3,Math.max(2,Math.ceil(best.lexical.query_tokens*0.45))):3;
  const direct=Boolean(best&&best.lexical.matched>=requiredMatches&&best.lexical.score>=0.4&&best.score>=0.55);
  if(!direct)return {direct:false,kind:"extractive",mode:ANSWER_MODE,text:"No direct answer was found in this resource. Review the node-local evidence below.",citation:null,resource_id:evidence[0]?.resource_id||null,chunk_index:null,confidence:best?Number(Math.min(0.49,best.score).toFixed(4)):0};
  return {direct:true,kind:"extractive",mode:ANSWER_MODE,text:best.text,citation:best.item.citation,resource_id:best.item.resource_id,chunk_index:best.item.chunk_index,confidence:Number(Math.min(0.99,best.score).toFixed(4))};
}
function improvePayload(payload){
  const question=String(payload.question||"");
  const candidates=(Array.isArray(payload.evidence)?payload.evidence:[]).map(item=>{
    const vectorScore=Number(item.score)||0;
    const lexical=lexicalMetrics(question,item.text);
    const rankScore=Math.min(1,vectorScore*0.72+lexical.score*0.28);
    return {...item,source_sha256:item.source_sha256||payload.source_sha256,vector_score:vectorScore,lexical_score:Number(lexical.score.toFixed(4)),rank_score:Number(rankScore.toFixed(4)),matched_query_terms:lexical.matched};
  }).sort((a,b)=>b.rank_score-a.rank_score||b.vector_score-a.vector_score);
  const evidence=[];
  for(const candidate of candidates){
    if(evidence.some(existing=>jaccard(existing.text,candidate.text)>=0.72))continue;
    evidence.push(candidate);
    if(evidence.length>=4)break;
  }
  const answer=buildAnswer(question,evidence);
  return {...payload,ranking_version:RANKING_VERSION,answer_mode:ANSWER_MODE,count:evidence.length,answer,evidence};
}
async function apiQueryPilotResource(env,request){
  const response=await apiQueryPilotResourceCore(env,request);
  let payload;
  try{payload=await response.clone().json();}catch{return response;}
  if(!payload||!payload.ok)return response;
  return Response.json(improvePayload(payload),{status:response.status,headers:response.headers});
}
async function apiBrowserQueryPilotResource(env,request){
  if(request.method!=="POST")return browserJson({ok:false,error:"Method not allowed"},405,{Allow:"POST"});
  const blocked=browserGuard(request);if(blocked)return blocked;
  const body=await request.json().catch(()=>null);
  if(!body||Array.isArray(body)||typeof body!=="object")return browserJson({ok:false,error:"A JSON object is required"},400);
  const keys=Object.keys(body);
  if(keys.some(key=>key!=="resource_id"&&key!=="question"))return browserJson({ok:false,error:"Only resource_id and question are accepted"},400);
  const resourceId=String(body.resource_id||"").trim(),question=String(body.question||"").trim();
  if(question.length<3||question.length>500)return browserJson({ok:false,error:"Question must be between 3 and 500 characters"},400);
  const internalRequest=new Request(request.url,{method:"POST",headers:{"Content-Type":"application/json","X-Lab-Ingest-Token":String(env.LAB_INGEST_TOKEN||"")},body:JSON.stringify({resource_id:resourceId,question,top_k:12})});
  const response=await apiQueryPilotResource(env,internalRequest);
  let payload;
  try{payload=await response.json();}catch{return browserJson({ok:false,error:"Retrieval response was not valid JSON"},502);}
  if(payload&&payload.ok){
    const evidence=Array.isArray(payload.evidence)?payload.evidence:[];
    if(evidence.some(item=>!item||item.resource_id!==resourceId))return browserJson({ok:false,error:"Node-local retrieval integrity check failed"},502);
    if(payload.answer&&payload.answer.resource_id&&payload.answer.resource_id!==resourceId)return browserJson({ok:false,error:"Node-local answer integrity check failed"},502);
  }
  return browserJson(payload,response.status);
}
async function apiPilotRetrievalStatus(env,request){
  const response=await apiPilotRetrievalStatusCore(env,request);
  let payload;
  try{payload=await response.clone().json();}catch{return response;}
  if(!payload||!payload.ok)return response;
  return Response.json({...payload,ranking_version:RANKING_VERSION,answer_mode:ANSWER_MODE},{status:response.status,headers:response.headers});
}

export {apiIndexPilotResources,apiQueryPilotResource,apiBrowserQueryPilotResource,apiPilotRetrievalStatus,VECTOR_INDEX_NAME,RANKING_VERSION,ANSWER_MODE};
