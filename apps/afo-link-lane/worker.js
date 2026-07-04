const VERSION = "2.3.13-spatial-searchlight";
// Feed auto-sync fallback is intentionally traffic-triggered while the live Cron Trigger schedule is installed separately.
const WORKER_NAME = "afo-link-lane-v235-lab";
const R2_PREFIX = "link-lane/og-images/";
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT, description TEXT, domain TEXT, og_image_key TEXT, group_name TEXT, video_id TEXT, is_short INTEGER DEFAULT 0, published_at TEXT, added_at TEXT DEFAULT (datetime('now')))",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_links_url ON links(url)",
  "CREATE TABLE IF NOT EXISTS feed_sources (id TEXT PRIMARY KEY, feed_url TEXT NOT NULL UNIQUE, name TEXT, enabled INTEGER DEFAULT 1, max_items INTEGER DEFAULT 35, added_at TEXT DEFAULT (datetime('now')), last_sync_at TEXT, last_status TEXT, last_error TEXT, last_added INTEGER DEFAULT 0, last_skipped INTEGER DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_feed_sources_enabled ON feed_sources(enabled)",
  "CREATE TABLE IF NOT EXISTS feed_sync_runs (id TEXT PRIMARY KEY, reason TEXT, started_at TEXT, finished_at TEXT, sources_checked INTEGER DEFAULT 0, items_found INTEGER DEFAULT 0, items_added INTEGER DEFAULT 0, items_skipped INTEGER DEFAULT 0, errors INTEGER DEFAULT 0)"
];

const R_GALAXY = 1500;
const MAX_UNIVERSE_NODES = 2500;

const DEFAULT_FEED_SOURCES = [
  {id:"feed-cloudflare-blog",feed_url:"https://blog.cloudflare.com/rss/",name:"Cloudflare Blog",max_items:35},
  {id:"feed-mozilla-hacks",feed_url:"https://hacks.mozilla.org/feed/",name:"Mozilla Hacks",max_items:35},
  {id:"feed-verge",feed_url:"https://www.theverge.com/rss/index.xml",name:"The Verge",max_items:35},
  {id:"feed-wired",feed_url:"https://www.wired.com/feed/rss",name:"WIRED",max_items:35},
  {id:"feed-techcrunch",feed_url:"https://techcrunch.com/feed/",name:"TechCrunch",max_items:35},
  {id:"feed-ars-technica",feed_url:"https://arstechnica.com/feed/",name:"Ars Technica",max_items:35},
  {id:"feed-github-blog",feed_url:"https://github.blog/feed/",name:"GitHub Blog",max_items:35},
  {id:"feed-nasa-news",feed_url:"https://www.nasa.gov/news-release/feed/",name:"NASA News",max_items:35},
  {id:"feed-openrss-cloudflare",feed_url:"https://openrss.org/blog.cloudflare.com/",name:"Open RSS: Cloudflare Blog",max_items:35},
  {id:"feed-openrss-mozilla",feed_url:"https://openrss.org/hacks.mozilla.org/",name:"Open RSS: Mozilla Hacks",max_items:35},
  {id:"feed-openrss-workers-sdk",feed_url:"https://openrss.org/github.com/cloudflare/workers-sdk/releases",name:"Open RSS: Cloudflare Workers SDK Releases",max_items:35},
  {id:"feed-openrss-openai-cookbook",feed_url:"https://openrss.org/github.com/openai/openai-cookbook/releases",name:"Open RSS: OpenAI Cookbook Releases",max_items:35},
  {id:"feed-openai-news",feed_url:"https://openai.com/news/rss.xml",name:"OpenAI News",max_items:25},
  {id:"feed-anthropic-news",feed_url:"https://www.anthropic.com/news/rss.xml",name:"Anthropic News",max_items:25},
  {id:"feed-google-ai-blog",feed_url:"https://blog.google/technology/ai/rss/",name:"Google AI Blog",max_items:25},
  {id:"feed-google-deepmind",feed_url:"https://deepmind.google/blog/rss.xml",name:"Google DeepMind Blog",max_items:25},
  {id:"feed-meta-ai",feed_url:"https://ai.meta.com/blog/rss/",name:"Meta AI Blog",max_items:25},
  {id:"feed-microsoft-ai",feed_url:"https://blogs.microsoft.com/ai/feed/",name:"Microsoft AI Blog",max_items:25},
  {id:"feed-aws-news",feed_url:"https://aws.amazon.com/blogs/aws/feed/",name:"AWS News Blog",max_items:25},
  {id:"feed-aws-ml",feed_url:"https://aws.amazon.com/blogs/machine-learning/feed/",name:"AWS Machine Learning Blog",max_items:25},
  {id:"feed-google-cloud",feed_url:"https://cloud.google.com/blog/rss",name:"Google Cloud Blog",max_items:25},
  {id:"feed-google-cloud-ai",feed_url:"https://cloud.google.com/blog/topics/ai-machine-learning/rss/",name:"Google Cloud AI Blog",max_items:25},
  {id:"feed-azure-blog",feed_url:"https://azure.microsoft.com/en-us/blog/feed/",name:"Microsoft Azure Blog",max_items:25},
  {id:"feed-huggingface",feed_url:"https://huggingface.co/blog/feed.xml",name:"Hugging Face Blog",max_items:25},
  {id:"feed-python-insider",feed_url:"https://pythoninsider.blogspot.com/feeds/posts/default?alt=rss",name:"Python Insider",max_items:25},
  {id:"feed-rust-blog",feed_url:"https://blog.rust-lang.org/feed.xml",name:"Rust Blog",max_items:25},
  {id:"feed-nodejs-blog",feed_url:"https://nodejs.org/en/feed/blog.xml",name:"Node.js Blog",max_items:25},
  {id:"feed-v8-blog",feed_url:"https://v8.dev/blog.atom",name:"V8 Blog",max_items:25},
  {id:"feed-webkit-blog",feed_url:"https://webkit.org/feed/",name:"WebKit Blog",max_items:25},
  {id:"feed-react-blog",feed_url:"https://react.dev/rss.xml",name:"React Blog",max_items:25},
  {id:"feed-nextjs-blog",feed_url:"https://nextjs.org/feed.xml",name:"Next.js Blog",max_items:25},
  {id:"feed-vercel-blog",feed_url:"https://vercel.com/blog/rss.xml",name:"Vercel Blog",max_items:25},
  {id:"feed-netlify-blog",feed_url:"https://www.netlify.com/blog/rss.xml",name:"Netlify Blog",max_items:25},
  {id:"feed-stackoverflow-blog",feed_url:"https://stackoverflow.blog/feed/",name:"Stack Overflow Blog",max_items:25},
  {id:"feed-gitlab-blog",feed_url:"https://about.gitlab.com/atom.xml",name:"GitLab Blog",max_items:25},
  {id:"feed-docker-blog",feed_url:"https://www.docker.com/blog/feed/",name:"Docker Blog",max_items:25},
  {id:"feed-kubernetes-blog",feed_url:"https://kubernetes.io/feed.xml",name:"Kubernetes Blog",max_items:25},
  {id:"feed-cncf-blog",feed_url:"https://www.cncf.io/feed/",name:"CNCF Blog",max_items:25},
  {id:"feed-fastly-blog",feed_url:"https://www.fastly.com/blog/rss.xml",name:"Fastly Blog",max_items:25},
  {id:"feed-fly-blog",feed_url:"https://fly.io/blog/feed.xml",name:"Fly.io Blog",max_items:25},
  {id:"feed-supabase-blog",feed_url:"https://supabase.com/blog/rss.xml",name:"Supabase Blog",max_items:25},
  {id:"feed-planetscale-blog",feed_url:"https://planetscale.com/blog/rss.xml",name:"PlanetScale Blog",max_items:25},
  {id:"feed-neon-blog",feed_url:"https://neon.tech/blog/rss.xml",name:"Neon Blog",max_items:25},
  {id:"feed-postgresql-news",feed_url:"https://www.postgresql.org/news.rss",name:"PostgreSQL News",max_items:25},
  {id:"feed-sqlite-changes",feed_url:"https://sqlite.org/changes.atom",name:"SQLite Changes",max_items:25},
  {id:"feed-tailscale-blog",feed_url:"https://tailscale.com/blog/index.xml",name:"Tailscale Blog",max_items:25},
  {id:"feed-1password-blog",feed_url:"https://blog.1password.com/rss/",name:"1Password Blog",max_items:25},
  {id:"feed-okta-blog",feed_url:"https://www.okta.com/blog/feed/",name:"Okta Blog",max_items:25},
  {id:"feed-snyk-blog",feed_url:"https://snyk.io/blog/feed.xml",name:"Snyk Blog",max_items:25},
  {id:"feed-wiz-blog",feed_url:"https://www.wiz.io/blog/rss.xml",name:"Wiz Blog",max_items:25},
  {id:"feed-cisa-news",feed_url:"https://www.cisa.gov/news.xml",name:"CISA News",max_items:25},
  {id:"feed-hn-frontpage",feed_url:"https://hnrss.org/frontpage",name:"Hacker News Front Page",max_items:25},
  {id:"feed-hn-best",feed_url:"https://hnrss.org/best",name:"Hacker News Best",max_items:25},
  {id:"feed-lobsters",feed_url:"https://lobste.rs/rss",name:"Lobsters",max_items:25},
  {id:"feed-reddit-programming",feed_url:"https://www.reddit.com/r/programming/.rss",name:"Reddit Programming",max_items:25},
  {id:"feed-sciencedaily-tech",feed_url:"https://www.sciencedaily.com/rss/top/technology.xml",name:"ScienceDaily Technology",max_items:25},
  {id:"feed-sciencedaily-cs",feed_url:"https://www.sciencedaily.com/rss/computers_math/computer_science.xml",name:"ScienceDaily Computer Science",max_items:25},
  {id:"feed-mit-ai",feed_url:"https://news.mit.edu/rss/topic/artificial-intelligence2",name:"MIT News AI",max_items:25},
  {id:"feed-mit-computers",feed_url:"https://news.mit.edu/rss/topic/computers",name:"MIT News Computers",max_items:25},
  {id:"feed-bair-blog",feed_url:"https://bair.berkeley.edu/blog/feed.xml",name:"Berkeley AI Research Blog",max_items:25},
  {id:"feed-ieee-ai",feed_url:"https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",name:"IEEE Spectrum AI",max_items:25},
  {id:"feed-npr-tech",feed_url:"https://feeds.npr.org/1019/rss.xml",name:"NPR Technology",max_items:25},
  {id:"feed-nyt-tech",feed_url:"https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",name:"NYTimes Technology",max_items:25},
  {id:"feed-guardian-tech",feed_url:"https://www.theguardian.com/technology/rss",name:"Guardian Technology",max_items:25},
  {id:"feed-engadget",feed_url:"https://www.engadget.com/rss.xml",name:"Engadget",max_items:25},
  {id:"feed-gizmodo",feed_url:"https://gizmodo.com/rss",name:"Gizmodo",max_items:25},
  {id:"feed-mashable-tech",feed_url:"https://mashable.com/feeds/rss/tech",name:"Mashable Tech",max_items:25},
  {id:"feed-venturebeat",feed_url:"https://venturebeat.com/feed/",name:"VentureBeat",max_items:25},
  {id:"feed-the-decoder",feed_url:"https://the-decoder.com/feed/",name:"The Decoder",max_items:25},
  {id:"feed-hackernoon",feed_url:"https://hackernoon.com/feed",name:"HackerNoon",max_items:25},
  {id:"feed-dzone",feed_url:"https://feeds.dzone.com/home",name:"DZone",max_items:25},
  {id:"feed-infoq",feed_url:"https://feed.infoq.com/",name:"InfoQ",max_items:25},
  {id:"feed-martin-fowler",feed_url:"https://martinfowler.com/feed.atom",name:"Martin Fowler",max_items:25},
  {id:"feed-simon-willison",feed_url:"https://simonwillison.net/atom/everything/",name:"Simon Willison",max_items:25},
  {id:"feed-julia-evans",feed_url:"https://jvns.ca/atom.xml",name:"Julia Evans",max_items:25},
  {id:"feed-lwn",feed_url:"https://lwn.net/headlines/rss",name:"LWN",max_items:25},
  {id:"feed-cosmos-magazine",feed_url:"https://cosmosmagazine.com/feed/",name:"Cosmos Magazine",max_items:25},
  {id:"feed-quanta",feed_url:"https://www.quantamagazine.org/feed/",name:"Quanta Magazine",max_items:25},
  {id:"feed-physorg-technology",feed_url:"https://phys.org/rss-feed/technology-news/",name:"Phys.org Technology",max_items:25}
];

function j(v,s=200){return Response.json(v,{status:s,headers:CORS});}
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36);}
function safe(v){return String(v||"").replace(/[<>"']/g,"");}

function fibPoint(i,n,radius){
  if(n<=1) return {x:0,y:0,z:radius};
  const golden=Math.PI*(3-Math.sqrt(5));
  const y=1-(i/(n-1))*2;
  const r=Math.sqrt(Math.max(0,1-y*y));
  const theta=golden*i;
  return {x:Math.cos(theta)*r*radius, y:y*radius, z:Math.sin(theta)*r*radius};
}

function clusterRadius(count){
  return Math.max(55, Math.min(500, 36*Math.sqrt(count)));
}

function layoutLinks(links){
  const groups={};
  links.forEach(function(l){const d=l.group_name||l.domain||"other";(groups[d]=groups[d]||[]).push(l);});
  const domains=Object.keys(groups);
  const anchors={};
  domains.forEach(function(d,i){const p=fibPoint(i,domains.length,R_GALAXY);anchors[d]={x:p.x,y:p.y,z:p.z,count:groups[d].length};});
  const galaxies=domains.map(function(d){const a=anchors[d];return{x:a.x,y:a.y,z:a.z,name:d,radius:clusterRadius(a.count),count:a.count};});
  const placed=[];
  domains.forEach(function(d){
    const group=groups[d],a=anchors[d];
    const localR=clusterRadius(group.length);
    group.forEach(function(l,idx){
      const off=fibPoint(idx,group.length,localR);
      placed.push(Object.assign({},l,{x:a.x+off.x,y:a.y+off.y,z:a.z+off.z}));
    });
  });
  const start=galaxies.length>0?{x:galaxies[0].x*0.3,y:galaxies[0].y*0.3+40,z:galaxies[0].z*0.3+220}:{x:0,y:0,z:400};
  return {links:placed,galaxies:galaxies,start:start};
}

// =================== HTML/meta extraction ===================

function decodeHtmlEntities(s){
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
}

function extractMetaProperty(html,property){
  const patterns=[
    new RegExp("<meta[^>]+property=[\"']"+property+"[\"'][^>]+content=[\"']([^\"']*)[\"']","i"),
    new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+property=[\"']"+property+"[\"']","i")
  ];
  for(const re of patterns){const m=html.match(re);if(m)return decodeHtmlEntities(m[1]);}
  return null;
}

function extractMetaName(html,name){
  const patterns=[
    new RegExp("<meta[^>]+name=[\"']"+name+"[\"'][^>]+content=[\"']([^\"']*)[\"']","i"),
    new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+name=[\"']"+name+"[\"']","i")
  ];
  for(const re of patterns){const m=html.match(re);if(m)return decodeHtmlEntities(m[1]);}
  return null;
}

function extractTitle(html){
  const m=html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?decodeHtmlEntities(m[1].trim()):null;
}

function resolveUrl(base,maybeRelative){
  try{return new URL(maybeRelative,base).toString();}catch{return null;}
}

function youtubeVideoId(url){
  try{
    const u=new URL(url);
    if(u.hostname==="youtu.be") return u.pathname.slice(1);
    if(u.hostname.endsWith("youtube.com")){
      if(u.pathname==="/watch") return u.searchParams.get("v");
      if(u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      if(u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
    }
  }catch{}
  return null;
}

async function fetchOembedPreview(url){
  const res=await fetch("https://www.youtube.com/oembed?url="+encodeURIComponent(url)+"&format=json");
  if(!res.ok) throw new Error("oEmbed failed: HTTP "+res.status);
  const data=await res.json();
  return {title:data.title||url,description:data.author_name?("by "+data.author_name):"",ogImageUrl:data.thumbnail_url||null,finalUrl:url};
}

async function fetchLinkPreview(targetUrl){
  // YouTube blocks direct scraping of /watch pages from datacenter IPs with a CAPTCHA wall.
  // Their official oEmbed endpoint is designed for exactly this use case and isn't blocked.
  const ytId=youtubeVideoId(targetUrl);
  if(ytId){
    try{ return await fetchOembedPreview(targetUrl); }catch{ /* fall through to generic scraping below */ }
  }
  const res=await fetch(targetUrl,{headers:{"User-Agent":"Mozilla/5.0 (compatible; AFOLinkLane/1.0)"},redirect:"follow"});
  if(!res.ok) throw new Error("Fetch failed: HTTP "+res.status);
  const html=(await res.text()).slice(0,200000);
  const finalUrl=res.url||targetUrl;
  const ogImage=extractMetaProperty(html,"og:image")||extractMetaProperty(html,"twitter:image");
  const title=extractMetaProperty(html,"og:title")||extractTitle(html)||finalUrl;
  const description=extractMetaProperty(html,"og:description")||extractMetaName(html,"description")||"";
  const resolvedImage=ogImage?resolveUrl(finalUrl,ogImage):null;
  return {title,description,ogImageUrl:resolvedImage,finalUrl};
}

async function storeOgImage(env,id,imageUrl){
  try{
    const res=await fetch(imageUrl);
    if(!res.ok) return null;
    const contentType=res.headers.get("content-type")||"image/jpeg";
    if(!contentType.startsWith("image/")) return null;
    const buf=await res.arrayBuffer();
    if(buf.byteLength>8000000) return null;
    const ext=contentType.includes("png")?"png":contentType.includes("webp")?"webp":contentType.includes("gif")?"gif":"jpg";
    const key=R2_PREFIX+id+"."+ext;
    await env.BUCKET.put(key,buf,{httpMetadata:{contentType}});
    return key;
  }catch{return null;}
}

function domainOf(url){
  try{return new URL(url).hostname.replace(/^www\./,"");}catch{return "other";}
}

function extractLinkRel(html,rel){
  const re=new RegExp("<link[^>]+rel=[\\\"'][^\\\"']*"+rel+"[^\\\"']*[\\\"'][^>]+href=[\\\"']([^\\\"']+)[\\\"']","i");
  const rev=new RegExp("<link[^>]+href=[\\\"']([^\\\"']+)[\\\"'][^>]+rel=[\\\"'][^\\\"']*"+rel+"[^\\\"']*[\\\"']","i");
  const m=html.match(re)||html.match(rev);
  return m?decodeHtmlEntities(m[1]):null;
}

function readerCleanTextParts(text){
  const decoded=decodeHtmlEntities(String(text||"")).replace(/\r/g,"\n").replace(/\u00a0/g," ").replace(/[ \t]+/g," ");
  const parts=decoded.split(/\n+/).map(function(p){return p.trim();}).filter(function(p){
    if(p.length<60) return false;
    if(/^cookies?\b/i.test(p)) return false;
    if(/^(share|subscribe|advertisement|sign up|log in|menu)$/i.test(p)) return false;
    return true;
  });
  const seen=new Set(),out=[];
  for(const p of parts){const key=p.toLowerCase().slice(0,120);if(!seen.has(key)){seen.add(key);out.push(p.slice(0,1200));}if(out.length>=50)break;}
  return out;
}

function readerParagraphsFromStructuredData(html){
  const out=[];
  const scripts=html.match(/<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>[\s\S]*?<\/script>/gi)||[];
  function walk(v){
    if(!v) return;
    if(Array.isArray(v)){v.forEach(walk);return;}
    if(typeof v==='object'){
      const type=String(v['@type']||'');
      if(/Article|NewsArticle|BlogPosting|Report/i.test(type)){
        if(v.articleBody) out.push(String(v.articleBody));
        if(v.description) out.push(String(v.description));
      }
      Object.keys(v).forEach(function(k){if(k!=='articleBody'&&k!=='description')walk(v[k]);});
    }
  }
  scripts.forEach(function(tag){
    const raw=(tag.replace(/^<script[^>]*>/i,"").replace(/<\/script>$/i,"")||"").trim();
    if(!raw) return;
    try{walk(JSON.parse(decodeHtmlEntities(raw)));}catch(e){}
  });
  return readerCleanTextParts(out.join("\n\n"));
}

function readerParagraphsFromMarkdown(md){
  const clean=String(md||"")
    .replace(/^Title:.*$/gmi,"")
    .replace(/^URL Source:.*$/gmi,"")
    .replace(/^Markdown Content:.*$/gmi,"")
    .replace(/^#{1,6}\s*/gm,"")
    .replace(/!\[[^\]]*\]\([^)]*\)/g,"")
    .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/```[\s\S]*?```/g," ");
  return readerCleanTextParts(clean);
}

async function browserRunMarkdownFallback(env,targetUrl){
  const token=env.CF_BROWSER_RENDERING_API_TOKEN||env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN||env.BROWSER_RUN_API_TOKEN||"";
  const accountId=env.CF_ACCOUNT_ID||env.CLOUDFLARE_ACCOUNT_ID||"";
  if(!token||!accountId) return null;
  try{
    const endpoint="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/browser-rendering/markdown";
    const res=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({url:targetUrl,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",gotoOptions:{waitUntil:"networkidle2",timeout:45000}})});
    if(!res.ok) return {ok:false,error:"Browser Run HTTP "+res.status};
    const data=await res.json().catch(()=>null);
    const markdown=data&&typeof data.result==="string"?data.result:"";
    const paragraphs=readerParagraphsFromMarkdown(markdown);
    if(paragraphs.length) return {ok:true,paragraphs:paragraphs,reader_source:"browser-run-markdown"};
    return {ok:false,error:"Browser Run returned no readable markdown"};
  }catch(e){return {ok:false,error:e.message};}
}

function readerParagraphsFromHtml(html){
  const article=(html.match(/<article[\s\S]*?<\/article>/i)||[])[0];
  const main=(html.match(/<main[\s\S]*?<\/main>/i)||[])[0];
  const body=(html.match(/<body[\s\S]*?<\/body>/i)||[])[0];
  let block=article||main||body||html;
  block=block.replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg[\s\S]*?<\/svg>/gi," ")
    .replace(/<nav[\s\S]*?<\/nav>/gi," ")
    .replace(/<header[\s\S]*?<\/header>/gi," ")
    .replace(/<footer[\s\S]*?<\/footer>/gi," ")
    .replace(/<form[\s\S]*?<\/form>/gi," ")
    .replace(/<!--([\s\S]*?)-->/g," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|blockquote)>/gi,"\n")
    .replace(/<[^>]+>/g," ");
  const decoded=decodeHtmlEntities(block).replace(/\r/g,"\n").replace(/[ \t]+/g," ");
  const out=readerCleanTextParts(decoded);
  if(out.length) return out;
  return readerParagraphsFromStructuredData(html);
}

async function apiReaderView(env,request){
  const reqUrl=new URL(request.url);
  const raw=reqUrl.searchParams.get("url")||"";
  let target;
  try{target=new URL(raw);}catch{return j({ok:false,error:"Invalid URL",fallback:"Reader view unavailable"},400);}
  if(target.protocol!=="http:"&&target.protocol!=="https:") return j({ok:false,error:"Unsupported URL",fallback:"Reader view unavailable"},400);
  let base={title:target.hostname,domain:domainOf(target.toString()),url:target.toString(),canonical:target.toString(),source_url:target.toString(),description:"",image:null,error:null};
  try{
    const res=await fetch(target.toString(),{headers:{"User-Agent":"Mozilla/5.0 (compatible; AFOLinkLaneContentVisor/1.0)","Accept":"text/html,application/xhtml+xml"},redirect:"follow"});
    const finalUrl=res.url||target.toString();
    const contentType=res.headers.get("content-type")||"";
    base.source_url=finalUrl;base.url=finalUrl;base.canonical=finalUrl;base.domain=domainOf(finalUrl);
    if(res.ok&&(contentType.includes("html")||contentType.includes("text"))){
      const html=(await res.text()).slice(0,500000);
      const canonical=resolveUrl(finalUrl,extractLinkRel(html,"canonical")||"")||finalUrl;
      const title=extractMetaProperty(html,"og:title")||extractTitle(html)||target.hostname;
      const description=extractMetaProperty(html,"og:description")||extractMetaName(html,"description")||"";
      const imageRaw=extractMetaProperty(html,"og:image")||extractMetaProperty(html,"twitter:image")||"";
      const image=imageRaw?resolveUrl(finalUrl,imageRaw):null;
      let paragraphs=readerParagraphsFromHtml(html);
      if(!paragraphs.length&&description) paragraphs=readerCleanTextParts(description);
      base={title,canonical,source_url:finalUrl,url:canonical,domain:domainOf(canonical||finalUrl),description,image,error:null};
      if(paragraphs.length) return j(Object.assign({},base,{ok:true,paragraphs,reader_source:"native",fallback:null}));
      base.error="native reader returned no paragraphs";
    }else{
      base.error=!res.ok?"HTTP "+res.status:"Unsupported content type";
    }
  }catch(e){base.error=e.message;}
  const browserRun=await browserRunMarkdownFallback(env,target.toString());
  if(browserRun&&browserRun.ok){
    return j(Object.assign({},base,{ok:true,paragraphs:browserRun.paragraphs,reader_source:browserRun.reader_source,fallback:null}),200);
  }
  if(browserRun&&browserRun.error) base.error=(base.error?base.error+"; ":"")+browserRun.error;
  return j(Object.assign({},base,{ok:false,paragraphs:[],reader_source:browserRun?"browser-run-markdown-failed":"none",fallback:"Reader view unavailable"}),200);
}

// =================== YouTube channel RSS (channel groups) ===================

function extractChannelId(html){
  // Canonical link is authoritative by construction - always the page's own
  // channel. The generic 'channelId':'UC...' JSON pattern is NOT reliable:
  // it matches the first such string anywhere in the page's data blob,
  // which is often a recommended video, ad, or related channel instead of
  // the one actually being viewed - confirmed via a real mismatch on
  // @mrbeast. Check canonical first, meta itemprop second, loose JSON last.
  let m=html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})"/i);
  if(m) return m[1];
  m=html.match(/<meta itemprop="channelId" content="([^"]+)"/i);
  if(m) return m[1];
  m=html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/);
  if(m) return m[1];
  return null;
}

async function resolveChannelId(input){
  const raw=String(input||"").trim();
  if(/^UC[0-9A-Za-z_-]{22}$/.test(raw)) return {channelId:raw,channelName:raw};
  let pageUrl=raw;
  if(!/^https?:\/\//i.test(pageUrl)) pageUrl="https://www.youtube.com/"+pageUrl.replace(/^\/+/,"");
  const res=await fetch(pageUrl,{headers:{"User-Agent":"Mozilla/5.0 (compatible; AFOLinkLane/1.0)"}});
  if(!res.ok) throw new Error("Could not load channel page: HTTP "+res.status);
  const html=await res.text();
  const channelId=extractChannelId(html);
  if(!channelId) throw new Error("Could not resolve a channel ID from that input - try the full channel URL.");
  const channelName=extractMetaProperty(html,"og:title")||raw;
  return {channelId,channelName};
}

// Generic RSS 2.0 / Atom parser (unlike parseAtomFeed above, which is
// YouTube-specific and relies on yt:videoId). Handles <item> (RSS) or
// <entry> (Atom) blocks, common image sources (enclosure, media:content,
// media:thumbnail, first <img> in description), and CDATA-wrapped text.
function stripCdata(s){
  const m=String(s||"").match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return m?m[1]:(s||"");
}
function parseGenericFeed(xml,limit){
  const entries=[];
  let blocks=xml.split(/<item[\s>]/i).slice(1);
  if(blocks.length===0) blocks=xml.split(/<entry[\s>]/i).slice(1);
  for(const raw of blocks.slice(0,limit)){
    const block=raw.split(/<\/(item|entry)>/i)[0];
    const title=decodeHtmlEntities(stripCdata((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"")).trim();
    let link=null;
    let m=block.match(/<link[^>]*href=["']([^"']+)["']/i);
    if(m) link=m[1];
    else { m=block.match(/<link[^>]*>([^<]*)<\/link>/i); if(m) link=m[1].trim(); }
    const pub=(block.match(/<(?:pubDate|published|updated)>([^<]+)<\/(?:pubDate|published|updated)>/i)||[])[1]||"";
    let desc=stripCdata((block.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i)||[])[1]||"");
    desc=decodeHtmlEntities(desc.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()).slice(0,300);
    let image=null;
    m=block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']*["']/i)
      ||block.match(/<media:content[^>]*url=["']([^"']+)["']/i)
      ||block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    if(m) image=m[1];
    if(!image){ m=block.match(/<img[^>]+src=["']([^"']+)["']/i); if(m) image=m[1]; }
    if(title&&link) entries.push({title,link,published:pub,description:desc,image});
  }
  return entries;
}
async function ensureLabSchema(env){
  for(const sql of SCHEMA){await env.DB.prepare(sql).run();}
}

function hashString(s){
  let h=0;
  for(let i=0;i<String(s).length;i++) h=((h<<5)-h+String(s).charCodeAt(i))|0;
  return h;
}

function normalizeFeedSource(source){
  return {
    id:String(source.id||uid()).slice(0,80),
    feed_url:String(source.feed_url||source.url||"").trim(),
    name:String(source.name||source.group_name||domainOf(source.feed_url||source.url||"")).trim(),
    max_items:Math.max(1,Math.min(Number(source.max_items||35),50))
  };
}

async function seedDefaultFeedSources(env){
  let inserted=0;
  for(const raw of DEFAULT_FEED_SOURCES){
    const s=normalizeFeedSource(raw);
    if(!s.feed_url) continue;
    const res=await env.DB.prepare("INSERT OR IGNORE INTO feed_sources (id,feed_url,name,max_items,enabled) VALUES (?,?,?,?,1)")
      .bind(s.id,s.feed_url,s.name,s.max_items).run();
    if(res.meta&&res.meta.changes) inserted+=res.meta.changes;
  }
  return inserted;
}

async function registerFeedSource(env,feedUrl,name,maxItems){
  const s=normalizeFeedSource({feed_url:feedUrl,name:name,max_items:maxItems});
  if(!s.feed_url) return null;
  const id="feed-"+domainOf(s.feed_url).replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"-"+Math.abs(hashString(s.feed_url));
  await env.DB.prepare("INSERT OR IGNORE INTO feed_sources (id,feed_url,name,max_items,enabled) VALUES (?,?,?,?,1)")
    .bind(id,s.feed_url,s.name,s.max_items).run();
  return id;
}

async function fetchFeedXml(feedUrl){
  const res=await fetch(feedUrl,{headers:{"User-Agent":"AFOLinkLaneFeedCron/1.0 (+https://afo-link-lane-v235-lab.jaredtechfit.workers.dev/)","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1"},redirect:"follow"});
  if(!res.ok) throw new Error("Feed fetch failed: HTTP "+res.status);
  return await res.text();
}

async function insertFeedItem(env,it,source){
  const url=it.link;
  if(!url) return {added:0,skipped:1};
  const existing=await env.DB.prepare("SELECT id FROM links WHERE url=?").bind(url).first();
  if(existing) return {added:0,skipped:1};
  const id=uid();
  let ogImageKey=null;
  if(it.image) ogImageKey=await storeOgImage(env,id,it.image);
  let publishedAt=null;
  if(it.published){const d=new Date(it.published);if(!isNaN(d.getTime())) publishedAt=d.toISOString().slice(0,10);}
  await env.DB.prepare("INSERT OR IGNORE INTO links (id,url,title,description,domain,og_image_key,group_name,published_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id,url,it.title||url,it.description||"",domainOf(url),ogImageKey,source.name||domainOf(url),publishedAt).run();
  return {added:1,skipped:0};
}

async function syncOneFeedSource(env,source,opts){
  const max=Math.max(1,Math.min(Number(opts.itemLimit||source.max_items||35),50));
  let added=0,skipped=0,found=0,error=null;
  try{
    const xml=await fetchFeedXml(source.feed_url);
    const items=parseGenericFeed(xml,max);
    found=items.length;
    for(const it of items){const r=await insertFeedItem(env,it,source);added+=r.added;skipped+=r.skipped;}
    await env.DB.prepare("UPDATE feed_sources SET last_sync_at=datetime('now'), last_status='ok', last_error=NULL, last_added=?, last_skipped=? WHERE id=?")
      .bind(added,skipped,source.id).run();
  }catch(e){
    error=e.message||String(e);
    await env.DB.prepare("UPDATE feed_sources SET last_sync_at=datetime('now'), last_status='error', last_error=? WHERE id=?")
      .bind(error,source.id).run();
  }
  return {id:source.id,name:source.name,feed_url:source.feed_url,found,added,skipped,error};
}

async function syncConfiguredFeeds(env,opts={}){
  await ensureLabSchema(env);
  const seeded=await seedDefaultFeedSources(env);
  const reason=String(opts.reason||"manual");
  const runId=uid();
  const sourceLimit=Math.max(1,Math.min(Number(opts.sourceLimit||opts.source_limit||12),40));
  const itemLimit=Math.max(1,Math.min(Number(opts.itemLimit||opts.item_limit||35),50));
  await env.DB.prepare("INSERT INTO feed_sync_runs (id,reason,started_at) VALUES (?,?,datetime('now'))").bind(runId,reason).run();
  const rows=(await env.DB.prepare("SELECT id,feed_url,name,max_items FROM feed_sources WHERE enabled=1 ORDER BY COALESCE(last_sync_at,'1970-01-01'), added_at LIMIT ?").bind(sourceLimit).all()).results||[];
  const sources=rows.map(normalizeFeedSource);
  let itemsFound=0,itemsAdded=0,itemsSkipped=0,errors=0;
  const results=[];
  for(const source of sources){
    const r=await syncOneFeedSource(env,source,{itemLimit});
    results.push(r);
    itemsFound+=r.found||0;itemsAdded+=r.added||0;itemsSkipped+=r.skipped||0;if(r.error)errors++;
  }
  await env.DB.prepare("UPDATE feed_sync_runs SET finished_at=datetime('now'), sources_checked=?, items_found=?, items_added=?, items_skipped=?, errors=? WHERE id=?")
    .bind(sources.length,itemsFound,itemsAdded,itemsSkipped,errors,runId).run();
  const countRow=await env.DB.prepare("SELECT COUNT(*) AS count FROM links").first();
  return {ok:true,version:VERSION,run_id:runId,reason,seeded_sources:seeded,sources_checked:sources.length,items_found:itemsFound,items_added:itemsAdded,items_skipped:itemsSkipped,errors,total_nodes:countRow?countRow.count:null,results};
}

async function apiSyncFeeds(env,request){
  const url=new URL(request.url);
  const body=request.method==="POST"?await request.json().catch(()=>({})):{};
  const sourceLimit=body.source_limit||url.searchParams.get("source_limit")||12;
  const itemLimit=body.item_limit||url.searchParams.get("item_limit")||35;
  return j(await syncConfiguredFeeds(env,{reason:"manual",sourceLimit,itemLimit}));
}

async function apiFeedSources(env){
  await ensureLabSchema(env);
  await seedDefaultFeedSources(env);
  const r=await env.DB.prepare("SELECT id,feed_url,name,enabled,max_items,last_sync_at,last_status,last_error,last_added,last_skipped FROM feed_sources ORDER BY name").all();
  return j({ok:true,sources:r.results||[]});
}

async function maybeAutoSyncFeeds(env,ctx){
  if(!ctx||typeof ctx.waitUntil!=="function") return;
  ctx.waitUntil((async()=>{
    try{
      await ensureLabSchema(env);
      await seedDefaultFeedSources(env);
      const latest=await env.DB.prepare("SELECT finished_at FROM feed_sync_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1").first();
      const lastMs=latest&&latest.finished_at?new Date(latest.finished_at+"Z").getTime():0;
      if(lastMs&&Date.now()-lastMs<4*60*60*1000) return;
      await syncConfiguredFeeds(env,{reason:"traffic-auto",sourceLimit:6,itemLimit:25});
    }catch(e){}
  })());
}

async function apiAddFeed(env,req){
  await ensureLabSchema(env);
  const body=await req.json().catch(()=>({}));
  const feedUrl=body.feed_url;
  const max=Math.max(1,Math.min(Number(body.max||15),30));
  if(!feedUrl) return j({ok:false,error:"feed_url required"},400);
  let xml;
  try{
    const res=await fetch(feedUrl,{headers:{"User-Agent":"Mozilla/5.0 (compatible; AFOLinkLane/1.0)"},redirect:"follow"});
    if(!res.ok) throw new Error("Feed fetch failed: HTTP "+res.status);
    xml=await res.text();
  }catch(e){ return j({ok:false,error:e.message},400); }
  const feedTitleMatch=xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const groupName=(body.name&&String(body.name).trim())||decodeHtmlEntities(stripCdata(feedTitleMatch?feedTitleMatch[1]:"")).trim()||domainOf(feedUrl);
  const items=parseGenericFeed(xml,max);
  if(items.length===0) return j({ok:false,error:"No entries found in feed (unsupported format or empty feed)."},400);
  let added=0,skipped=0;
  for(const it of items){
    const url=it.link;
    if(!url) continue;
    const existing=await env.DB.prepare("SELECT id FROM links WHERE url=?").bind(url).first();
    if(existing){ skipped++; continue; }
    const id=uid();
    let ogImageKey=null;
    if(it.image) ogImageKey=await storeOgImage(env,id,it.image);
    let publishedAt=null;
    if(it.published){ const d=new Date(it.published); if(!isNaN(d.getTime())) publishedAt=d.toISOString().slice(0,10); }
    await env.DB.prepare("INSERT OR IGNORE INTO links (id,url,title,description,domain,og_image_key,group_name,published_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id,url,it.title||url,it.description||"",domainOf(url),ogImageKey,groupName,publishedAt).run();
    added++;
  }
  await registerFeedSource(env,feedUrl,groupName,max);
  return j({ok:true,feed:groupName,added,skipped,found:items.length});
}

function parseAtomFeed(xml,limit){
  const entries=[];
  const blocks=xml.split("<entry>").slice(1);
  for(const block of blocks.slice(0,limit)){
    const videoId=(block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)||[])[1];
    const title=decodeHtmlEntities((block.match(/<title>([^<]*)<\/title>/)||[])[1]||"");
    const published=(block.match(/<published>([^<]+)<\/published>/)||[])[1]||"";
    const thumb=(block.match(/<media:thumbnail url="([^"]+)"/)||[])[1]||null;
    if(videoId) entries.push({videoId,title,published,thumb,url:"https://www.youtube.com/watch?v="+videoId});
  }
  return entries;
}

async function fetchChannelVideos(channelId,limit){
  const res=await fetch("https://www.youtube.com/feeds/videos.xml?channel_id="+encodeURIComponent(channelId));
  if(!res.ok) throw new Error("RSS feed fetch failed: HTTP "+res.status);
  const xml=await res.text();
  return parseAtomFeed(xml,limit);
}

// A real Short stays on /shorts/{id}; a regular video gets redirected to
// /watch?v={id}. (oEmbed's width/height is just a scaled default embed size,
// not the video's true aspect ratio - it does not distinguish Shorts.)
async function detectShort(videoId){
  try{
    const res=await fetch("https://www.youtube.com/shorts/"+videoId,{headers:{"User-Agent":"Mozilla/5.0 (compatible; AFOLinkLane/1.0)"},redirect:"follow"});
    res.body&&res.body.cancel&&res.body.cancel();
    return res.url.includes("/shorts/");
  }catch{return false;}
}

async function apiAddChannel(env,req){
  const body=await req.json().catch(()=>({}));
  const input=body.input;
  const max=Math.max(1,Math.min(Number(body.max||15),25));
  if(!input) return j({ok:false,error:"input required"},400);
  let resolved;
  try{ resolved=await resolveChannelId(input); }catch(e){ return j({ok:false,error:e.message},400); }
  let videos;
  try{ videos=await fetchChannelVideos(resolved.channelId,max); }catch(e){ return j({ok:false,error:e.message},400); }
  if(videos.length===0) return j({ok:false,error:"Channel RSS feed returned no videos."},400);
  const groupName=resolved.channelName||resolved.channelId;
  let added=0,skipped=0,shorts=0;
  for(const v of videos){
    const existing=await env.DB.prepare("SELECT id FROM links WHERE video_id=? OR url=?").bind(v.videoId,v.url).first();
    if(existing){ skipped++; continue; }
    const isShort=await detectShort(v.videoId);
    if(isShort) shorts++;
    const finalUrl=isShort?("https://www.youtube.com/shorts/"+v.videoId):v.url;
    const id=uid();
    let ogImageKey=null;
    if(v.thumb) ogImageKey=await storeOgImage(env,id,v.thumb);
    const publishedAt=v.published?v.published.slice(0,10):null;
    const desc="by "+groupName;
    await env.DB.prepare("INSERT OR IGNORE INTO links (id,url,title,description,domain,og_image_key,group_name,video_id,is_short,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id,finalUrl,v.title||finalUrl,desc,"youtube.com",ogImageKey,groupName,v.videoId,isShort?1:0,publishedAt).run();
    added++;
  }
  return j({ok:true,channel:groupName,channel_id:resolved.channelId,added,skipped,shorts,found:videos.length});
}

// =================== GAME SCRIPT ===================

function buildGameScript(layout){
  const L=[];
  L.push("const LAYOUT="+JSON.stringify(layout)+";");
  L.push("let scene,camera,renderer,raycaster;");
  L.push("let planetMeshes=[],galaxyMeshes={},galaxyAnchors={};");
  L.push("let nodeData=[],farMesh=null,farOwner=[],farActiveCount=0,thumbCursor=0;");
  L.push("let currentFormation='sphere';");
  L.push("let clusterMode='galaxies';");
  L.push("let galaxyLabels=[];");
  L.push("let insideGalaxy=null;");
  L.push("let gameState='menu';");
  L.push("let speed=3;");
  L.push(String.raw`const navState={speed:3,yaw:0,orbit:0,panX:0,panY:0,held:{},braking:false};
const NAV_LIMITS={minSpeed:-6,maxSpeed:14,speedStep:1,holdSpeedStep:0.14,yawStep:0.1,orbitStep:0.12,panStep:22,holdYawStep:0.022,holdOrbitStep:0.026,holdPanStep:4.2};`);
  L.push(String.raw`const searchState={open:false,query:'',matches:[],matchSet:new Set(),activeIndex:-1,cameraFlight:null};
const _searchPos=new THREE.Vector3(),_searchScale=new THREE.Vector3(1,1,1),_searchQuat=new THREE.Quaternion(),_searchM4=new THREE.Matrix4(),_searchTmp=new THREE.Vector3();`);
  L.push("let yaw=0,pitch=0,yawVel=0,pitchVel=0;");
  L.push("const PITCH_LIMIT=1.3;");
  L.push(String.raw`const RENDER_BUDGET=(function(){
  const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
  const small=Math.min(window.innerWidth||999,window.innerHeight||999)<760;
  const mem=navigator.deviceMemory||4;
  const cores=navigator.hardwareConcurrency||4;
  const mobile=coarse||small||mem<=4||cores<=4;
  return {mobile:mobile,maxPromoted:mobile?150:300,promoteBatch:mobile?10:24,textureChecks:mobile?6:12,maxTextureInflight:mobile?2:4,maxLoadedImageTextures:mobile?60:140,labelNearDist:mobile?260:380,labelTargetDist:650,pixelRatio:mobile?1:Math.min(window.devicePixelRatio||1,1.5)};
})();
const MAX_PROMOTED=RENDER_BUDGET.maxPromoted;
let sharedCubeGeo=null,textureQueue=[],textureInflight=0,loadedImageTextureCount=0,contextLost=false;
function getSharedCubeGeo(){if(!sharedCubeGeo)sharedCubeGeo=new THREE.BoxGeometry(28,28,28);return sharedCubeGeo;}
function budgetedPixelRatio(){return RENDER_BUDGET.pixelRatio;}`);
  L.push("let touchActive=false,touchStartX=0,touchStartY=0,lastX=0,lastY=0,isTap=true;");
  L.push("let targeted=null;");
  L.push("let frame=0;");

  L.push("function initScene(){");
  L.push("  const wrap=document.getElementById('wrap');");
  L.push("  scene=new THREE.Scene();");
  L.push("  camera=new THREE.PerspectiveCamera(72,wrap.clientWidth/wrap.clientHeight,0.1,6000);");
  L.push("  camera.position.set(LAYOUT.start.x,LAYOUT.start.y,LAYOUT.start.z);");
  L.push("  camera.up.set(0,1,0);");
  L.push("  camera.lookAt(0,0,0);");
  L.push("  camera.rotation.reorder('YXZ');");
  L.push("  yaw=camera.rotation.y;pitch=Math.max(-PITCH_LIMIT,Math.min(PITCH_LIMIT,camera.rotation.x));");
  L.push("  camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));");
  L.push("  const cnv=document.getElementById('gc');");
  L.push("  renderer=new THREE.WebGLRenderer({antialias:!RENDER_BUDGET.mobile,canvas:cnv,powerPreference:'high-performance'});");
  L.push("  renderer.setPixelRatio(budgetedPixelRatio());");
  L.push("  renderer.setSize(wrap.clientWidth,wrap.clientHeight);");
  L.push("  cnv.addEventListener('webglcontextlost',function(e){e.preventDefault();contextLost=true;showToast('GPU reset - recovering universe');},false);");
  L.push("  cnv.addEventListener('webglcontextrestored',function(){location.reload();},false);");
  L.push("  raycaster=new THREE.Raycaster();raycaster.far=4000;");
  L.push("  buildStarfield();buildGalaxies();");
  L.push("  const ld=document.getElementById('loadScreen');");
  L.push("  if(ld){ld.classList.add('fadeOut');setTimeout(function(){ld.style.display='none';},700);}");
  L.push("  window.addEventListener('resize',onResize);");
  L.push("}");

  L.push("function onResize(){const wrap=document.getElementById('wrap');camera.aspect=wrap.clientWidth/wrap.clientHeight;camera.updateProjectionMatrix();renderer.setSize(wrap.clientWidth,wrap.clientHeight);}");

  L.push("function buildStarfield(){");
  L.push("  const n=2500;const pos=new Float32Array(n*3);");
  L.push("  for(let i=0;i<n;i++){");
  L.push("    const r=2000+Math.random()*1800;");
  L.push("    const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);");
  L.push("    pos[i*3]=r*Math.sin(ph)*Math.cos(th);");
  L.push("    pos[i*3+1]=r*Math.sin(ph)*Math.sin(th);");
  L.push("    pos[i*3+2]=r*Math.cos(ph);");
  L.push("  }");
  L.push("  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));");
  L.push("  const mat=new THREE.PointsMaterial({color:0xaaccff,size:3,sizeAttenuation:true});");
  L.push("  scene.add(new THREE.Points(geo,mat));");
  L.push("}");

  L.push("function showToast(msg){");
  L.push("  const t=document.getElementById('toast');if(!t) return;");
  L.push("  t.textContent=msg;t.classList.add('show');");
  L.push("  clearTimeout(t._hideTimer);");
  L.push("  t._hideTimer=setTimeout(function(){t.classList.remove('show');},2200);");
  L.push("}");

  L.push("function checkZoneEntry(){");
  L.push("  if(clusterMode==='supercluster'){insideGalaxy=null;return;}");
  L.push("  let inside=null;");
  L.push("  Object.keys(galaxyAnchors).forEach(function(k){");
  L.push("    const a=galaxyAnchors[k];");
  L.push("    const d=Math.sqrt((camera.position.x-a.x)**2+(camera.position.y-a.y)**2+(camera.position.z-a.z)**2);");
  L.push("    if(d<a.radius) inside=k;");
  L.push("  });");
  L.push("  if(inside!==insideGalaxy){if(inside) showToast('\uD83C\uDF10 Entering '+inside);insideGalaxy=inside;}");
  L.push("}");

  L.push("function fmtSphere(i,n,r){");
  L.push("  if(n<=1) return {x:0,y:0,z:r};");
  L.push("  const golden=Math.PI*(3-Math.sqrt(5));");
  L.push("  const y=1-(i/(n-1))*2;");
  L.push("  const rad=Math.sqrt(Math.max(0,1-y*y));");
  L.push("  const theta=golden*i;");
  L.push("  return {x:Math.cos(theta)*rad*r,y:y*r,z:Math.sin(theta)*rad*r};");
  L.push("}");
  L.push("function fmtSpiral(i,n,r){");
  L.push("  const turns=3.2;const t=n<=1?0:i/(n-1);const ang=t*turns*Math.PI*2;const rad=t*r;const yh=(t-0.5)*r*0.7;");
  L.push("  return {x:Math.cos(ang)*rad,y:yh,z:Math.sin(ang)*rad};");
  L.push("}");
  L.push("function fmtCube(i,n,r){");
  L.push("  const side=Math.max(1,Math.ceil(Math.pow(n,1/3)));");
  L.push("  const x=(i%side)-(side-1)/2,y=Math.floor((i/side)%side)-(side-1)/2,z=Math.floor(i/(side*side))-(side-1)/2;");
  L.push("  const sp=(r*2)/side;");
  L.push("  return {x:x*sp,y:y*sp,z:z*sp};");
  L.push("}");
  L.push("function fmtTorus(i,n,r){");
  L.push("  const minor=r*0.32,major=r*0.78;");
  L.push("  const u=(i/Math.max(1,n))*Math.PI*4,v=((i*7)%Math.max(1,n)/Math.max(1,n))*Math.PI*2;");
  L.push("  const x=(major+minor*Math.cos(v))*Math.cos(u),y=(major+minor*Math.cos(v))*Math.sin(u),z=minor*Math.sin(v);");
  L.push("  return {x:x,y:y,z:z};");
  L.push("}");
  L.push("const FORMATIONS={sphere:fmtSphere,spiral:fmtSpiral,cube:fmtCube,torus:fmtTorus};");
  L.push("const FORMATION_GEO={");
  L.push("  sphere:function(r){return new THREE.SphereGeometry(r,16,12);},");
  L.push("  spiral:function(r){return new THREE.SphereGeometry(r,16,12);},");
  L.push("  cube:function(r){return new THREE.BoxGeometry(r*1.5,r*1.5,r*1.5);},");
  L.push("  torus:function(r){return new THREE.TorusGeometry(r*0.78,r*0.32,8,24);}");
  L.push("};");

  L.push("function superclusterRadius(count){return Math.max(1200,Math.min(3000,90*Math.sqrt(count)));}");
  L.push("function repositionAll(){");
  L.push("  const _rm4=new THREE.Matrix4();");
  L.push("  if(clusterMode==='supercluster'){");
  L.push("    const r=superclusterRadius(nodeData.length);");
  L.push("    planetMeshes.forEach(function(mesh){");
  L.push("      const off=FORMATIONS[currentFormation](mesh.userData.globalIdx,nodeData.length,r);");
  L.push("      mesh.position.set(off.x,off.y,off.z);");
  L.push("      mesh.userData.x=off.x;mesh.userData.y=off.y;mesh.userData.z=off.z;");
  L.push("    });");
  L.push("    nodeData.forEach(function(p){");
  L.push("      if(p.promoted) return;");
  L.push("      const off=FORMATIONS[currentFormation](p.globalIdx,nodeData.length,r);");
  L.push("      p.x=off.x;p.y=off.y;p.z=off.z;");
  L.push("      _rm4.makeTranslation(p.x,p.y,p.z);");
  L.push("      farMesh.setMatrixAt(p.farSlot,_rm4);");
  L.push("    });");
  L.push("  } else {");
  L.push("    planetMeshes.forEach(function(mesh){");
  L.push("      const a=galaxyAnchors[mesh.userData.galaxyKey];if(!a) return;");
  L.push("      const off=FORMATIONS[currentFormation](mesh.userData.localIdx,mesh.userData.localCount,a.radius);");
  L.push("      mesh.position.set(a.x+off.x,a.y+off.y,a.z+off.z);");
  L.push("      mesh.userData.x=a.x+off.x;mesh.userData.y=a.y+off.y;mesh.userData.z=a.z+off.z;");
  L.push("    });");
  L.push("    nodeData.forEach(function(p){");
  L.push("      if(p.promoted) return;");
  L.push("      const a=galaxyAnchors[p.galaxyKey];if(!a) return;");
  L.push("      const off=FORMATIONS[currentFormation](p.localIdx,p.localCount,a.radius);");
  L.push("      p.x=a.x+off.x;p.y=a.y+off.y;p.z=a.z+off.z;");
  L.push("      _rm4.makeTranslation(p.x,p.y,p.z);");
  L.push("      farMesh.setMatrixAt(p.farSlot,_rm4);");
  L.push("    });");
  L.push("  }");
  L.push("  farMesh.instanceMatrix.needsUpdate=true;");
  L.push("}");

  L.push("function applyFormation(name){");
  L.push("  applySearchlight();");
  L.push("  if(!FORMATIONS[name]) return;");
  L.push("  currentFormation=name;");
  L.push("  repositionAll();");
  L.push("  document.querySelectorAll('.fmtBtn').forEach(function(b){b.classList.toggle('active',b.dataset.f===name);});");
  L.push("  showToast('Formation: '+name.charAt(0).toUpperCase()+name.slice(1));");
  L.push("}");

  L.push("function setClusterMode(mode){");
  L.push("  if(mode===clusterMode) return;");
  L.push("  clusterMode=mode;");
  L.push("  galaxyLabels.forEach(function(l){l.visible=(mode==='galaxies');});");
  L.push("  repositionAll();");
  L.push("  document.querySelectorAll('.clusterBtn').forEach(function(b){b.classList.toggle('active',b.dataset.c===mode);});");
  L.push("  showToast(mode==='supercluster'?'\uD83C\uDF0C Supercluster mode':'\uD83C\uDF10 Galaxy mode');");
  L.push("}");

  L.push("function makeLabelSprite(text){");
  L.push("  const c=document.createElement('canvas');c.width=256;c.height=64;");
  L.push("  const ctx=c.getContext('2d');");
  L.push("  ctx.fillStyle='rgba(0,10,20,0.55)';ctx.fillRect(0,0,256,64);");
  L.push("  ctx.strokeStyle='#00ff88';ctx.lineWidth=2;ctx.strokeRect(2,2,252,60);");
  L.push("  ctx.fillStyle='#00ff88';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.textBaseline='middle';");
  L.push("  ctx.fillText(text.slice(0,20),128,33);");
  L.push("  const tex=new THREE.CanvasTexture(c);tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;");
  L.push("  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});");
  L.push("  const spr=new THREE.Sprite(mat);spr.scale.set(120,30,1);");
  L.push("  return spr;");
  L.push("}");

  L.push("function makeFaceTexture(label,value,bgColor,isHighlight){");
  L.push("  const c=document.createElement('canvas');c.width=256;c.height=256;");
  L.push("  const ctx=c.getContext('2d');");
  L.push("  ctx.fillStyle=bgColor||'#0a0a18';ctx.fillRect(0,0,256,256);");
  L.push("  ctx.strokeStyle=isHighlight?'rgba(0,255,170,0.7)':'rgba(0,255,170,0.35)';ctx.lineWidth=5;ctx.strokeRect(3,3,250,250);");
  L.push("  ctx.fillStyle='#00ff88';ctx.font='bold 17px monospace';ctx.textAlign='center';");
  L.push("  ctx.fillText(label,128,34);");
  L.push("  ctx.strokeStyle='rgba(0,255,136,0.3)';ctx.beginPath();ctx.moveTo(22,48);ctx.lineTo(234,48);ctx.stroke();");
  L.push("  ctx.fillStyle='#e0e0e0';ctx.font='15px monospace';");
  L.push("  const words=String(value||'(none)').split(' ');let lines=[],cur='';");
  L.push("  words.forEach(function(w){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>216){lines.push(cur);cur=w;}else cur=t;});");
  L.push("  if(cur)lines.push(cur);lines=lines.slice(0,8);");
  L.push("  const startY=128-(lines.length-1)*11;");
  L.push("  lines.forEach(function(line,i){ctx.fillText(line,128,startY+i*22);});");
  L.push("  const tex=new THREE.CanvasTexture(c);tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;return tex;");
  L.push("}");

  L.push("function buildGalaxies(){");
  L.push("  LAYOUT.galaxies.forEach(function(g){");
  L.push("    galaxyAnchors[g.name]={x:g.x,y:g.y,z:g.z,radius:g.radius};");
  L.push("    const label=makeLabelSprite('\uD83C\uDF10 '+g.name);");
  L.push("    label.position.set(g.x,g.y+g.radius+55,g.z);scene.add(label);galaxyLabels.push(label);");
  L.push("  });");
  L.push("  const counts={};");
  L.push("  LAYOUT.links.forEach(function(p){const k=p.group_name||p.domain||'other';counts[k]=(counts[k]||0)+1;});");
  L.push("  const idxCursor={};");
  L.push("  const n=LAYOUT.links.length;");
  L.push("  const farGeo=new THREE.BoxGeometry(28,28,28);");
  L.push("  const farMat=new THREE.MeshBasicMaterial({color:0x223344});");
  L.push("  farMesh=new THREE.InstancedMesh(farGeo,farMat,Math.max(n,1));");
  L.push("  farMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);");
  L.push("  const _bm4=new THREE.Matrix4();");
  L.push("  LAYOUT.links.forEach(function(p,i){");
  L.push("    const k=p.group_name||p.domain||'other';");
  L.push("    const localIdx=idxCursor[k]=(idxCursor[k]||0);idxCursor[k]++;");
  L.push("    const entry=Object.assign({},p,{galaxyKey:k,localIdx:localIdx,localCount:counts[k],globalIdx:i,promoted:false,farSlot:i,loadedTier:'none',loadingTier:null});");
  L.push("    nodeData.push(entry);");
  L.push("    _bm4.makeTranslation(p.x,p.y,p.z);");
  L.push("    farMesh.setMatrixAt(i,_bm4);");
  L.push("    farOwner.push(i);");
  L.push("  });");
  L.push("  farActiveCount=n;");
  L.push("  farMesh.count=farActiveCount;");
  L.push("  farMesh.instanceMatrix.needsUpdate=true;");
  L.push("  scene.add(farMesh);");
  L.push("}");

  L.push("function promoteNode(i){");
  L.push("  const p=nodeData[i];");
  L.push("  if(p.promoted) return;");
  L.push("  p.promoted=true;");
  L.push("  const slot=p.farSlot;");
  L.push("  const lastSlot=farActiveCount-1;");
  L.push("  if(slot!==lastSlot){");
  L.push("    const lastNodeIdx=farOwner[lastSlot];");
  L.push("    const _pm4=new THREE.Matrix4();");
  L.push("    farMesh.getMatrixAt(lastSlot,_pm4);");
  L.push("    farMesh.setMatrixAt(slot,_pm4);");
  L.push("    farOwner[slot]=lastNodeIdx;");
  L.push("    nodeData[lastNodeIdx].farSlot=slot;");
  L.push("  }");
  L.push("  farActiveCount--;");
  L.push("  farMesh.count=farActiveCount;");
  L.push("  farMesh.instanceMatrix.needsUpdate=true;");
  L.push("  p.farSlot=-1;");
  L.push("  const geo=getSharedCubeGeo();");
  L.push("  const materials=[");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344}),");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344}),");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344}),");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344}),");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344}),");
  L.push("    new THREE.MeshBasicMaterial({color:0x223344})");
  L.push("  ];");
  L.push("  const mesh=new THREE.Mesh(geo,materials);");
  L.push("  mesh.position.set(p.x,p.y,p.z);");
  L.push("  mesh.userData=p;");
  L.push("  p.mesh=mesh;");
  L.push("  scene.add(mesh);");
  L.push("  planetMeshes.push(mesh);");
  L.push("  applySearchlight();");
  L.push("}");

  L.push("function loadLabelsFor(mesh){");
  L.push("  if(mesh.userData.labelsLoaded) return;");
  L.push("  mesh.userData.labelsLoaded=true;");
  L.push("  const p=mesh.userData;");
  L.push("  const dateStr=(p.added_at||'').slice(0,10);");
  L.push("  const isYT=p.domain==='youtube.com';");
  L.push("  const typeLabel=isYT?(p.is_short?'\uD83D\uDCF1 SHORT':'\uD83C\uDFAC VIDEO'):'\uD83D\uDD17 LINK';");
  L.push("  const typeColor=p.is_short?'#2a0a1a':'#0a0a18';");
  L.push("  const pubDate=(p.published_at||dateStr||'');");
  L.push("  const faces=[[0,'TITLE',p.title||p.url,'#0a0a18',false],[1,'CHANNEL',p.group_name||p.domain,'#0a0a18',false],[2,'TYPE',typeLabel,typeColor,Boolean(p.is_short)],[3,'PUBLISHED',pubDate,'#0a0a18',false],[5,'SOURCE',p.domain,'#0a1f16',true]];");
  L.push("  faces.forEach(function(f){");
  L.push("    const mat=mesh.material[f[0]];");
  L.push("    mat.map=makeFaceTexture(f[1],f[2],f[3],f[4]);");
  L.push("    mat.color.set(0xffffff);");
  L.push("    mat.needsUpdate=true;");
  L.push("  });");
  L.push("}");

  L.push(String.raw`const texLoader=new THREE.TextureLoader();
function desiredTier(dist){if(dist>(RENDER_BUDGET.mobile?520:700))return'none';if(dist>(RENDER_BUDGET.mobile?180:260))return'thumb';return'full';}
const TIER_RANK={none:0,thumb:1,full:2};
function makeThumbTexture(srcTex){
  const img=srcTex&&srcTex.image;if(!img)return srcTex;
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,128,128);
  try{ctx.drawImage(img,0,0,128,128);}catch(e){return srcTex;}
  if(srcTex.dispose)srcTex.dispose();
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;return t;
}
function releaseImageTexture(mesh){
  if(!mesh||!mesh.material)return;
  const mat=mesh.material[4];
  if(mat&&mat.map&&mesh.userData.hasImageTexture){mat.map.dispose&&mat.map.dispose();mat.map=null;mat.color.set(0x223344);mat.needsUpdate=true;mesh.userData.loadedTier='none';mesh.userData.hasImageTexture=false;loadedImageTextureCount=Math.max(0,loadedImageTextureCount-1);}
}
function trimImageTextures(){
  if(loadedImageTextureCount<=RENDER_BUDGET.maxLoadedImageTextures)return;
  for(let i=0;i<planetMeshes.length&&loadedImageTextureCount>RENDER_BUDGET.maxLoadedImageTextures;i++){
    const mesh=planetMeshes[i];
    if(!mesh||mesh===targeted||(focus&&focus.mesh===mesh))continue;
    if(camera.position.distanceTo(mesh.position)>700)releaseImageTexture(mesh);
  }
}
function applyBudgetedTexture(mesh,tier,tex){
  if(contextLost||!mesh||!mesh.material)return;
  if(tier==='thumb')tex=makeThumbTexture(tex);else{tex.colorSpace=THREE.SRGBColorSpace;tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;}
  const faceMat=mesh.material[4];
  if(faceMat.map&&mesh.userData.hasImageTexture){faceMat.map.dispose&&faceMat.map.dispose();loadedImageTextureCount=Math.max(0,loadedImageTextureCount-1);}
  faceMat.map=tex;faceMat.color.set(0xffffff);faceMat.needsUpdate=true;
  mesh.userData.loadedTier=tier;mesh.userData.loadingTier=null;mesh.userData.queuedTier=null;mesh.userData.hasImageTexture=true;loadedImageTextureCount++;
  trimImageTextures();
}
function pumpTextureQueue(){
  if(contextLost)return;
  while(textureInflight<RENDER_BUDGET.maxTextureInflight&&textureQueue.length){
    const job=textureQueue.shift(),mesh=job.mesh,tier=job.tier;
    if(!mesh||TIER_RANK[tier]<=TIER_RANK[mesh.userData.loadedTier]){if(mesh)mesh.userData.queuedTier=null;continue;}
    textureInflight++;mesh.userData.loadingTier=tier;
    texLoader.load('/og-image/'+mesh.userData.id,function(tex){textureInflight=Math.max(0,textureInflight-1);applyBudgetedTexture(mesh,tier,tex);pumpTextureQueue();},undefined,function(){textureInflight=Math.max(0,textureInflight-1);mesh.userData.loadingTier=null;mesh.userData.queuedTier=null;pumpTextureQueue();});
  }
}
function loadTierFor(mesh,tier){
  if(tier==='none'){releaseImageTexture(mesh);return;}
  if(!mesh||!mesh.userData.og_image_key)return;
  if(TIER_RANK[tier]<=TIER_RANK[mesh.userData.loadedTier])return;
  if(mesh.userData.loadingTier&&TIER_RANK[mesh.userData.loadingTier]>=TIER_RANK[tier])return;
  if(mesh.userData.queuedTier&&TIER_RANK[mesh.userData.queuedTier]>=TIER_RANK[tier])return;
  mesh.userData.queuedTier=tier;textureQueue.push({mesh:mesh,tier:tier});pumpTextureQueue();
}
function maybeLoadLabelsFor(mesh,dist,force){if(!mesh||mesh.userData.labelsLoaded)return;if(force||mesh===targeted||dist<RENDER_BUDGET.labelNearDist)loadLabelsFor(mesh);}`);
  L.push("let lodCursor=0;");
  L.push("function updateLOD(){");
  L.push("  const promoteBatch=RENDER_BUDGET.promoteBatch;");
  L.push("  if(planetMeshes.length<MAX_PROMOTED){");
  L.push("    for(let i=0;i<promoteBatch&&nodeData.length>0;i++){");
  L.push("      const idx=lodCursor%nodeData.length;lodCursor++;");
  L.push("      const p=nodeData[idx];");
  L.push("      if(p.promoted) continue;");
  L.push("      const dx=camera.position.x-p.x,dy=camera.position.y-p.y,dz=camera.position.z-p.z;");
  L.push("      const promoteDist2=RENDER_BUDGET.mobile?360000:640000;");
  L.push("      if(dx*dx+dy*dy+dz*dz<promoteDist2){");
  L.push("        promoteNode(idx);");
  L.push("        if(planetMeshes.length>=MAX_PROMOTED) break;");
  L.push("      }");
  L.push("    }");
  L.push("  }");
  L.push("  const thumbBatch=RENDER_BUDGET.textureChecks;");
  L.push("  for(let i=0;i<thumbBatch&&planetMeshes.length>0;i++){");
  L.push("    const mesh=planetMeshes[thumbCursor%planetMeshes.length];thumbCursor++;");
  L.push("    const dist=camera.position.distanceTo(mesh.position);");
  L.push("    const want=desiredTier(dist);");
  L.push("    maybeLoadLabelsFor(mesh,dist,false);");
  L.push("    if(want==='none') releaseImageTexture(mesh);");
  L.push("    else if(TIER_RANK[want]>TIER_RANK[mesh.userData.loadedTier]) loadTierFor(mesh,want);");
  L.push("  }");
  L.push("}");

  L.push("const _toMesh=new THREE.Vector3(),_fwd=new THREE.Vector3();");
  L.push("function updateTarget(){");
  L.push("  camera.getWorldDirection(_fwd);");
  L.push("  let best=null,bestScore=Infinity;");
  L.push("  for(let i=0;i<planetMeshes.length;i++){");
  L.push("    const mesh=planetMeshes[i];");
  L.push("    _toMesh.copy(mesh.position).sub(camera.position);");
  L.push("    const dist=_toMesh.length();");
  L.push("    if(dist>1400||dist<1) continue;");
  L.push("    _toMesh.multiplyScalar(1/dist);");
  L.push("    const dot=_toMesh.dot(_fwd);");
  L.push("    if(dot<0.85) continue;");
  L.push("    const score=(1-dot)+dist*0.0006;");
  L.push("    if(score<bestScore){bestScore=score;best=mesh;}");
  L.push("  }");
  L.push("  targeted=best;");
  L.push("  if(targeted) maybeLoadLabelsFor(targeted,0,true);");
  L.push("}");
  L.push("function trySelect(){if(targeted) startFocus(targeted);}");
  L.push(String.raw`
function normalizeSearchText(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9@._:-]+/g,' ').trim();}
function nodeSearchText(p){
  const type=p.domain==='youtube.com'?(p.is_short?'short video':'video'):'link article';
  return normalizeSearchText([p.title,p.description,p.domain,p.group_name,type,p.published_at,p.added_at,p.url].join(' '));
}
function nodePosition(p,out){
  if(p&&p.mesh){out.copy(p.mesh.position);return out;}
  out.set((p&&p.x)||0,(p&&p.y)||0,(p&&p.z)||0);return out;
}
function searchScaleFor(idx,pulse){
  if(!searchState.query)return 1;
  if(!searchState.matchSet.has(idx))return 0.32;
  const selected=searchState.activeIndex>=0&&searchState.matches[searchState.activeIndex]===idx;
  if(selected)return pulse?1.72+Math.sin(performance.now()*0.007)*0.18:1.82;
  return 1.38;
}
function applySearchlight(){
  const hasQuery=Boolean(searchState.query);
  planetMeshes.forEach(function(mesh){const idx=mesh.userData.globalIdx;const s=hasQuery?searchScaleFor(idx,false):1;mesh.scale.setScalar(s);});
  if(!farMesh)return;
  nodeData.forEach(function(p){
    if(p.promoted||p.farSlot<0)return;
    const s=hasQuery?searchScaleFor(p.globalIdx,false):1;
    _searchPos.set(p.x,p.y,p.z);_searchScale.set(s,s,s);_searchM4.compose(_searchPos,_searchQuat,_searchScale);farMesh.setMatrixAt(p.farSlot,_searchM4);
  });
  farMesh.instanceMatrix.needsUpdate=true;
}
function pulseSearchlight(){
  if(!searchState.query||searchState.activeIndex<0)return;
  const idx=searchState.matches[searchState.activeIndex],p=nodeData[idx];
  if(p&&p.mesh)p.mesh.scale.setScalar(searchScaleFor(idx,true));
}
function updateSearchUI(){
  const deck=document.getElementById('searchDeck'),count=document.getElementById('searchCount'),input=document.getElementById('searchInput');
  if(deck)deck.classList.toggle('open',searchState.open||Boolean(searchState.query));
  if(input&&document.activeElement!==input)input.value=searchState.query;
  if(!count)return;
  if(!searchState.query){count.textContent='Searchlight ready';return;}
  if(!searchState.matches.length){count.textContent='0 results';return;}
  count.textContent=(searchState.activeIndex+1)+' / '+searchState.matches.length+' results';
}
function toggleSearchDeck(force){
  searchState.open=typeof force==='boolean'?force:!searchState.open;
  updateSearchUI();
  if(searchState.open){const input=document.getElementById('searchInput');if(input)setTimeout(function(){input.focus();input.select();},30);}
}
function computeSearchMatches(){
  const q=normalizeSearchText(searchState.query);
  if(!q){searchState.matches=[];searchState.matchSet=new Set();searchState.activeIndex=-1;searchState.cameraFlight=null;applySearchlight();updateSearchUI();return;}
  const terms=q.split(/\s+/).filter(Boolean);
  const ranked=[];
  nodeData.forEach(function(p,idx){
    const hay=p._searchText||(p._searchText=nodeSearchText(p));
    const ok=terms.every(function(term){return hay.indexOf(term)!==-1;});
    if(!ok)return;
    const dist=nodePosition(p,_searchTmp).distanceTo(camera.position);
    ranked.push({idx:idx,dist:dist,title:String(p.title||''),date:String(p.published_at||p.added_at||'')});
  });
  ranked.sort(function(a,b){return a.dist-b.dist||b.date.localeCompare(a.date)||a.title.localeCompare(b.title);});
  searchState.matches=ranked.map(function(r){return r.idx;});
  searchState.matchSet=new Set(searchState.matches);
  searchState.activeIndex=searchState.matches.length?0:-1;
  applySearchlight();updateSearchUI();
}
function updateSearchQuery(q){searchState.query=String(q||'').trim();computeSearchMatches();}
function clearSearch(){searchState.query='';const input=document.getElementById('searchInput');if(input)input.value='';computeSearchMatches();showToast('Searchlight cleared');}
function currentSearchNode(){if(searchState.activeIndex<0)return null;return nodeData[searchState.matches[searchState.activeIndex]]||null;}
function selectSearchResult(i,fly){
  if(!searchState.matches.length){showToast('No search results');return;}
  searchState.activeIndex=(i+searchState.matches.length)%searchState.matches.length;
  applySearchlight();updateSearchUI();
  const p=currentSearchNode();if(p)showToast('Search result: '+String(p.title||p.domain||'link').slice(0,54));
  if(fly)flyToSearchResult();
}
function nextSearchResult(){selectSearchResult(searchState.activeIndex+1,true);}
function flyToSearchResult(){
  const p=currentSearchNode();if(!p){showToast('No selected result');return;}
  if(!p.promoted)promoteNode(p.globalIdx);
  const mesh=p.mesh;
  if(mesh){loadTierFor(mesh,'full');maybeLoadLabelsFor(mesh,0,true);targeted=mesh;}
  const target=nodePosition(p,new THREE.Vector3());
  let dir=camera.position.clone().sub(target);if(dir.lengthSq()<1)dir.set(0,0,1);dir.normalize();
  const toPos=target.clone().add(dir.multiplyScalar(190));
  const lm=new THREE.Matrix4().lookAt(toPos,target,new THREE.Vector3(0,1,0));
  const toQ=new THREE.Quaternion().setFromRotationMatrix(lm);
  searchState.cameraFlight={fromPos:camera.position.clone(),toPos:toPos,fromQ:camera.quaternion.clone(),toQ:toQ,t:0,nodeIdx:p.globalIdx};
  speed=0;syncNavSpeed();clearNavHeld();showToast('Flying to search result');updateHUD();
}
function updateSearchFlight(){
  const f=searchState.cameraFlight;if(!f)return false;
  f.t=Math.min(1,f.t+0.035);const e=easeIO(f.t);
  camera.position.lerpVectors(f.fromPos,f.toPos,e);camera.quaternion.slerpQuaternions(f.fromQ,f.toQ,e);
  if(f.t>=1){const eu=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=eu.y;pitch=Math.max(-PITCH_LIMIT,Math.min(PITCH_LIMIT,eu.x));searchState.cameraFlight=null;targeted=nodeData[f.nodeIdx]&&nodeData[f.nodeIdx].mesh?nodeData[f.nodeIdx].mesh:targeted;}
  return true;
}`);

  L.push("function openLink(p){");
  L.push("  const ov=document.getElementById('ov');if(!ov)return;");
  L.push("  const img=document.getElementById('ovImg');");
  L.push("  if(p.og_image_key){img.src='/og-image/'+p.id;img.style.display='block';}else{img.style.display='none';}");
  L.push("  document.getElementById('ovTitle').textContent=p.title||p.url;");
  L.push("  document.getElementById('ovDesc').textContent=p.description||'';");
  L.push("  const badge=p.domain==='youtube.com'?(p.is_short?'\uD83D\uDCF1 Short':'\uD83C\uDFAC Video'):'\uD83D\uDD17 Link';");
  L.push("  document.getElementById('ovDomain').textContent='\uD83C\uDF10 '+(p.group_name||p.domain||'')+' \u00B7 '+badge;");
  L.push("  document.getElementById('ovVisit').onclick=function(){window.open(p.url,'_blank');};");
  L.push("  ov.style.display='flex';gameState='paused';");
  L.push("}");
  L.push("function closeLink(){document.getElementById('ov').style.display='none';gameState='flying';}");
  L.push(String.raw`let contentVisor={open:false,previousGameState:null,node:null,kind:null};`);
  L.push(String.raw`function cvEscape(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}`);
  L.push(String.raw`function cvYoutubeId(p){if(p&&p.video_id)return p.video_id;try{const u=new URL((p&&p.url)||'');if(u.hostname==='youtu.be')return u.pathname.slice(1);if(u.hostname.endsWith('youtube.com')){if(u.pathname==='/watch')return u.searchParams.get('v');if(u.pathname.startsWith('/shorts/'))return u.pathname.split('/')[2];if(u.pathname.startsWith('/embed/'))return u.pathname.split('/')[2];}}catch(e){}return null;}`);
  L.push(String.raw`function cvSetShell(p,kind){document.getElementById('cvTitle').textContent=(p&&p.title)||'Content Visor';document.getElementById('cvDomain').textContent=((p&&p.group_name)||((p&&p.domain)||''))+' · '+kind;const a=document.getElementById('cvOpenOriginal');a.href=(p&&p.url)||'#';}`);
  L.push(String.raw`function renderYoutubeVisor(p,videoId){const src='https://www.youtube.com/embed/'+encodeURIComponent(videoId)+'?enablejsapi=1&autoplay=1';document.getElementById('cvBody').innerHTML='<div class="cvFrameWrap"><iframe id="cvYtPlayer" src="'+src+'" title="YouTube player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><div class="cvNote">YouTube embedded player engine · JS API hook ready for later play/pause/finish telemetry.</div>';}`);
  L.push(String.raw`function renderArticleVisor(data,p){const ok=data&&data.ok&&Array.isArray(data.paragraphs)&&data.paragraphs.length;const image=data&&data.image?'<img class="cvHero" src="'+cvEscape(data.image)+'" alt="">':'';const desc=(data&&data.description)||(p&&p.description)||'';const descHtml=desc?'<p class="cvDesc">'+cvEscape(desc)+'</p>':'';const source=data&&data.reader_source&&data.reader_source!=='none'?'<div class="cvNote">Reader engine: '+cvEscape(data.reader_source)+'</div>':'';const fallbackCard='<div class="cvFallback"><h2>Reader view needs the original</h2><p>This source blocked or hid clean article text from the in-app reader, but the Content Visor can still show the saved preview and keep you in the universe.</p>'+(desc?'<p>'+cvEscape(desc)+'</p>':'')+'<p>Use Open Original for the full source, or Return to Universe to keep flying.</p></div>';const paragraphs=ok?data.paragraphs.map(function(t){return '<p>'+cvEscape(t)+'</p>';}).join(''):fallbackCard;document.getElementById('cvTitle').textContent=(data&&data.title)||(p&&p.title)||'Reader View';document.getElementById('cvDomain').textContent=((data&&data.domain)||(p&&p.domain)||'source')+' · Article Reader';document.getElementById('cvBody').innerHTML=image+descHtml+source+'<article class="cvArticle">'+paragraphs+'</article>';}`);
  L.push(String.raw`async function openContentVisor(p){const visor=document.getElementById('contentVisor');if(!visor||!p)return;contentVisor.open=true;contentVisor.previousGameState=gameState;contentVisor.node=p;document.getElementById('focusBar').style.display='none';gameState='content_visor';visor.classList.add('open');visor.setAttribute('aria-hidden','false');const body=document.getElementById('cvBody');body.innerHTML='<div class="cvLoading">Loading in-app content engine...</div>';const yt=cvYoutubeId(p);if(yt){contentVisor.kind='youtube';cvSetShell(p,'YouTube Player');renderYoutubeVisor(p,yt);return;}contentVisor.kind='reader';cvSetShell(p,'Article Reader');try{const r=await fetch('/content/read?url='+encodeURIComponent(p.url));const data=await r.json();renderArticleVisor(data,p);}catch(e){renderArticleVisor({ok:false,title:p.title,domain:p.domain,description:p.description,paragraphs:[]},p);}}`);
  L.push(String.raw`function closeContentVisor(){const visor=document.getElementById('contentVisor');if(!visor)return;const player=document.getElementById('cvYtPlayer');if(player)player.src='about:blank';visor.classList.remove('open');visor.setAttribute('aria-hidden','true');document.getElementById('cvBody').innerHTML='';const prior=contentVisor.previousGameState;contentVisor.open=false;contentVisor.previousGameState=null;contentVisor.node=null;contentVisor.kind=null;gameState=prior||((focus&&focus.phase==='focused')?'focused':'flying');if(gameState==='focused'&&focus&&focus.phase==='focused')document.getElementById('focusBar').style.display='flex';}`);

  L.push("let focus=null;");
  L.push("const FOCUS_CAM_DIST=110,FOCUS_GRID_DIST=64;");
  L.push("function easeIO(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}");
  L.push("const FACE_LOCAL=[[1,0,0,0,Math.PI/2,0],[-1,0,0,0,-Math.PI/2,0],[0,1,0,-Math.PI/2,0,0],[0,-1,0,Math.PI/2,0,0],[0,0,1,0,0,0],[0,0,-1,0,Math.PI,0]];");
  L.push("const GRID_ORDER=[0,4,1,2,3,5];");
  L.push("function startFocus(mesh){");
  L.push("  if(!mesh||focus) return;");
  L.push("  gameState='focusing';speed=0;targeted=null;yawVel=0;pitchVel=0;");
  L.push("  document.getElementById('crosshair').classList.remove('locked');");
  L.push("  document.getElementById('targetHint').style.display='none';");
  L.push("  loadTierFor(mesh,'full');loadLabelsFor(mesh);");
  L.push("  const dir=camera.position.clone().sub(mesh.position);");
  L.push("  if(dir.lengthSq()<1) dir.set(0,0,1);");
  L.push("  dir.normalize();");
  L.push("  const toPos=mesh.position.clone().add(dir.multiplyScalar(FOCUS_CAM_DIST));");
  L.push("  const lm=new THREE.Matrix4().lookAt(toPos,mesh.position,new THREE.Vector3(0,1,0));");
  L.push("  const toQ=new THREE.Quaternion().setFromRotationMatrix(lm);");
  L.push("  focus={mesh:mesh,phase:'camera',t:0,fromPos:camera.position.clone(),toPos:toPos,fromQ:camera.quaternion.clone(),toQ:toQ,planes:[]};");
  L.push("}");
  L.push("function spawnUnfold(){");
  L.push("  const f=focus,mesh=f.mesh;");
  L.push("  mesh.visible=false;");
  L.push("  const vh=2*FOCUS_GRID_DIST*Math.tan(camera.fov*Math.PI/360);");
  L.push("  const vw=vh*camera.aspect;");
  L.push("  const cell=Math.min(vw/2.35,vh/3.6);");
  L.push("  const gap=cell*0.1;");
  L.push("  const right=new THREE.Vector3(1,0,0).applyQuaternion(f.toQ);");
  L.push("  const up=new THREE.Vector3(0,1,0).applyQuaternion(f.toQ);");
  L.push("  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(f.toQ);");
  L.push("  const center=f.toPos.clone().add(fwd.multiplyScalar(FOCUS_GRID_DIST));");
  L.push("  const s=cell/28;");
  L.push("  for(let k=0;k<6;k++){");
  L.push("    const fi=GRID_ORDER[k];");
  L.push("    const d=FACE_LOCAL[fi];");
  L.push("    const n=new THREE.Vector3(d[0],d[1],d[2]).applyQuaternion(mesh.quaternion);");
  L.push("    const fromPos=mesh.position.clone().add(n.multiplyScalar(14));");
  L.push("    const fromQ=mesh.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d[3],d[4],d[5])));");
  L.push("    const col=k%2,row=Math.floor(k/2);");
  L.push("    const toPos=center.clone().add(right.clone().multiplyScalar((col-0.5)*(cell+gap))).add(up.clone().multiplyScalar((1-row)*(cell+gap)));");
  L.push("    const mat=mesh.material[fi];");
  L.push("    mat.side=THREE.DoubleSide;mat.depthTest=false;mat.needsUpdate=true;");
  L.push("    const plane=new THREE.Mesh(new THREE.PlaneGeometry(28,28),mat);");
  L.push("    plane.renderOrder=999;");
  L.push("    plane.position.copy(fromPos);plane.quaternion.copy(fromQ);");
  L.push("    scene.add(plane);");
  L.push("    f.planes.push({m:plane,fromPos:fromPos,toPos:toPos,fromQ:fromQ,toQ:f.toQ.clone(),s:s});");
  L.push("  }");
  L.push("}");
  L.push("function updateFocus(){");
  L.push("  if(!focus) return;");
  L.push("  const f=focus;");
  L.push("  if(f.phase==='camera'){");
  L.push("    f.t=Math.min(1,f.t+0.03);");
  L.push("    const e=easeIO(f.t);");
  L.push("    camera.position.lerpVectors(f.fromPos,f.toPos,e);");
  L.push("    camera.quaternion.slerpQuaternions(f.fromQ,f.toQ,e);");
  L.push("    if(f.t>=1){spawnUnfold();f.phase='unfold';f.t=0;}");
  L.push("  } else if(f.phase==='unfold'||f.phase==='refold'){");
  L.push("    f.t=Math.min(1,f.t+0.04);");
  L.push("    const e=f.phase==='unfold'?easeIO(f.t):easeIO(1-f.t);");
  L.push("    f.planes.forEach(function(p){");
  L.push("      p.m.position.lerpVectors(p.fromPos,p.toPos,e);");
  L.push("      p.m.quaternion.slerpQuaternions(p.fromQ,p.toQ,e);");
  L.push("      const sc=1+(p.s-1)*e;p.m.scale.set(sc,sc,1);");
  L.push("    });");
  L.push("    if(f.t>=1){");
  L.push("      if(f.phase==='unfold'){f.phase='focused';gameState='focused';showFocusBar();}");
  L.push("      else finishRefold();");
  L.push("    }");
  L.push("  }");
  L.push("}");
  L.push("function showFocusBar(){");
  L.push("  const p=focus.mesh.userData;");
  L.push("  document.getElementById('fbTitle').textContent=p.title||p.url||'';");
  L.push("  document.getElementById('fbVisit').onclick=function(){openContentVisor(p);};");
  L.push("  document.getElementById('focusBar').style.display='flex';");
  L.push("}");
  L.push("function closeFocus(){");
  L.push("  if(!focus||focus.phase!=='focused') return;");
  L.push("  document.getElementById('focusBar').style.display='none';");
  L.push("  focus.phase='refold';focus.t=0;gameState='refolding';");
  L.push("}");
  L.push("function finishRefold(){");
  L.push("  const f=focus;");
  L.push("  f.planes.forEach(function(p){");
  L.push("    p.m.material.side=THREE.FrontSide;p.m.material.depthTest=true;p.m.material.needsUpdate=true;");
  L.push("    scene.remove(p.m);p.m.geometry.dispose();");
  L.push("  });");
  L.push("  f.mesh.visible=true;");
  L.push("  const eu=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');");
  L.push("  yaw=eu.y;pitch=Math.max(-PITCH_LIMIT,Math.min(PITCH_LIMIT,eu.x));");
  L.push("  camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));");
  L.push("  focus=null;gameState='flying';");
  L.push("}");

  L.push("function startTouch(x,y){touchActive=true;touchStartX=x;touchStartY=y;lastX=x;lastY=y;isTap=true;}");
  L.push("function moveTouch(x,y){");
  L.push("  if(!touchActive) return;");
  L.push("  const dx=x-lastX,dy=y-lastY;");
  L.push("  yawVel=-dx*0.0028;pitchVel=-dy*0.0028;");
  L.push("  lastX=x;lastY=y;");
  L.push("  if(Math.abs(x-touchStartX)>10||Math.abs(y-touchStartY)>10) isTap=false;");
  L.push("}");
  L.push("function endTouch(){if(isTap){if(gameState==='flying')trySelect();else if(gameState==='focused')closeFocus();}touchActive=false;yawVel=0;pitchVel=0;}");

  L.push("let isPinching=false,pinchStartDist=0,pinchStartSpeed=0;");
  L.push("const PINCH_SENSITIVITY=0.06;");
  L.push("function touchDist(t1,t2){const dx=t1.clientX-t2.clientX,dy=t1.clientY-t2.clientY;return Math.sqrt(dx*dx+dy*dy);}");
  L.push("function startPinch(t1,t2){isPinching=true;pinchStartDist=touchDist(t1,t2);pinchStartSpeed=speed;touchActive=false;}");
  L.push("function movePinch(t1,t2){");
  L.push("  const dist=touchDist(t1,t2);");
  L.push("  const delta=pinchStartDist-dist;");
  L.push("  speed=Math.max(-6,Math.min(14,pinchStartSpeed+delta*PINCH_SENSITIVITY));");
  L.push("}");
  L.push("function endPinch(){isPinching=false;}");

  L.push("const canvas=document.getElementById('gc');");
  L.push("canvas.addEventListener('touchstart',function(e){");
  L.push("  e.preventDefault();");
  L.push("  const r=canvas.getBoundingClientRect();");
  L.push("  if(e.touches.length>=2){startPinch(e.touches[0],e.touches[1]);return;}");
  L.push("  if(!isPinching){const t=e.touches[0];startTouch(t.clientX-r.left,t.clientY-r.top);}");
  L.push("},{passive:false});");
  L.push("canvas.addEventListener('touchmove',function(e){");
  L.push("  e.preventDefault();");
  L.push("  if(isPinching&&e.touches.length>=2){movePinch(e.touches[0],e.touches[1]);return;}");
  L.push("  if(!isPinching){const t=e.touches[0],r=canvas.getBoundingClientRect();moveTouch(t.clientX-r.left,t.clientY-r.top);}");
  L.push("},{passive:false});");
  L.push("canvas.addEventListener('touchend',function(e){");
  L.push("  e.preventDefault();");
  L.push("  if(isPinching){if(e.touches.length<2) endPinch();return;}");
  L.push("  endTouch();");
  L.push("},{passive:false});");
  L.push("canvas.addEventListener('mousedown',function(e){const r=canvas.getBoundingClientRect();startTouch(e.clientX-r.left,e.clientY-r.top);});");
  L.push("canvas.addEventListener('mousemove',function(e){if(!touchActive)return;const r=canvas.getBoundingClientRect();moveTouch(e.clientX-r.left,e.clientY-r.top);});");
  L.push("window.addEventListener('mouseup',function(){endTouch();});");

  L.push(String.raw`function clearNavHeld(){navState.held={};document.querySelectorAll('.flightBtn.held').forEach(function(b){b.classList.remove('held');});}
function clampFlightSpeed(v){return Math.max(NAV_LIMITS.minSpeed,Math.min(NAV_LIMITS.maxSpeed,v));}
function syncNavSpeed(){navState.speed=speed;}
function adjustSpeed(d,announce){speed=clampFlightSpeed(speed+d);syncNavSpeed();if(announce!==false)showToast(speed===0?'■ Cruise off':('speed '+speed.toFixed(1)+'x'));updateHUD();}
function fullStop(){speed=0;syncNavSpeed();clearNavHeld();showToast('■ Flight stopped');updateHUD();}
function nudgeNav(kind){
  if(kind==='speedUp'){adjustSpeed(NAV_LIMITS.speedStep);return;}
  if(kind==='speedDown'){adjustSpeed(-NAV_LIMITS.speedStep);return;}
  if(kind==='stop'){fullStop();return;}
  if(kind==='turnLeft')navState.yaw+=NAV_LIMITS.yawStep;
  if(kind==='turnRight')navState.yaw-=NAV_LIMITS.yawStep;
  if(kind==='orbitLeft')navState.orbit+=NAV_LIMITS.orbitStep;
  if(kind==='orbitRight')navState.orbit-=NAV_LIMITS.orbitStep;
  if(kind==='panLeft')navState.panX-=NAV_LIMITS.panStep;
  if(kind==='panRight')navState.panX+=NAV_LIMITS.panStep;
}
function applyNavHold(){
  if(navState.held.speedUp)adjustSpeed(NAV_LIMITS.holdSpeedStep,false);
  if(navState.held.speedDown)adjustSpeed(-NAV_LIMITS.holdSpeedStep,false);
  if(navState.held.turnLeft)navState.yaw+=NAV_LIMITS.holdYawStep;
  if(navState.held.turnRight)navState.yaw-=NAV_LIMITS.holdYawStep;
  if(navState.held.orbitLeft)navState.orbit+=NAV_LIMITS.holdOrbitStep;
  if(navState.held.orbitRight)navState.orbit-=NAV_LIMITS.holdOrbitStep;
  if(navState.held.panLeft)navState.panX-=NAV_LIMITS.holdPanStep;
  if(navState.held.panRight)navState.panX+=NAV_LIMITS.holdPanStep;
}
function orbitCamera(amount){
  if(!amount)return;
  const pivot=targeted?targeted.position:new THREE.Vector3(0,0,0);
  const offset=camera.position.clone().sub(pivot);
  offset.applyAxisAngle(new THREE.Vector3(0,1,0),amount);
  camera.position.copy(pivot).add(offset);
  yaw+=amount;
}
function applyFlightNav(){
  applyNavHold();
  if(navState.panX||navState.panY){camera.translateX(navState.panX);camera.translateY(navState.panY);navState.panX=0;navState.panY=0;}
  if(navState.orbit){orbitCamera(navState.orbit);navState.orbit=0;}
}
function bindFlightHud(){
  const hud=document.getElementById('flightHud');if(!hud||hud._bound)return;hud._bound=true;
  hud.querySelectorAll('[data-nav]').forEach(function(btn){
    const kind=btn.dataset.nav;
    const release=function(e){if(e)e.preventDefault();delete navState.held[kind];btn.classList.remove('held');};
    btn.addEventListener('pointerdown',function(e){e.preventDefault();if(kind==='stop'){fullStop();return;}nudgeNav(kind);navState.held[kind]=true;btn.classList.add('held');try{btn.setPointerCapture(e.pointerId);}catch(err){};});
    btn.addEventListener('pointerup',release);
    btn.addEventListener('pointercancel',release);
    btn.addEventListener('pointerleave',release);
  });
}`);

  L.push("function updateHUD(){");
  L.push("  const hint=document.getElementById('targetHint'),cross=document.getElementById('crosshair');");
  L.push("  if(targeted){cross.classList.add('locked');hint.style.display='block';hint.textContent='TAP TO VIEW \u2014 '+(targeted.userData.title||targeted.userData.url||'link');}");
  L.push("  else{cross.classList.remove('locked');hint.style.display='none';}");
  L.push("  const sl=document.getElementById('speedLabel');");
  L.push("  if(sl){sl.textContent=speed===0?'\\u23F8 STOPPED':speed<0?'\\u25C0 REVERSE '+Math.abs(speed).toFixed(1)+'x':'\\uD83D\\uDE80 '+speed.toFixed(1)+'x';sl.style.color=speed<0?'#ffaa44':'#888';}");
  L.push("  const fs=document.getElementById('flightStatus');");
  L.push("  if(fs){const mode=speed===0?'cruise off':(speed>0?'cruise forward':'cruise reverse');fs.textContent='speed: '+speed.toFixed(1)+'x / '+mode;}");
  L.push("  const arrow=document.getElementById('compass');");
  L.push("  if(clusterMode==='supercluster'){");
  L.push("    arrow.style.display='none'; document.getElementById('compassLabel').textContent='';");
  L.push("  } else {");
  L.push("    let nearest=null,nd=Infinity;");
  L.push("    LAYOUT.galaxies.forEach(function(g){const d=camera.position.distanceTo(new THREE.Vector3(g.x,g.y,g.z));if(d<nd&&d>g.radius+80){nd=d;nearest=g;}});");
  L.push("    if(nearest){const v=new THREE.Vector3(nearest.x,nearest.y,nearest.z).project(camera);const ang=Math.atan2(v.y,v.x);");
  L.push("      arrow.style.display='block';arrow.style.transform='translate(-50%,-50%) rotate('+(-ang)+'rad)';");
  L.push("      document.getElementById('compassLabel').textContent=nearest.name+' \u2014 '+Math.round(nd)+'u';");
  L.push("    } else { arrow.style.display='none'; document.getElementById('compassLabel').textContent=''; }");
  L.push("  }");
  L.push("}");

  L.push("function billboardCubes(){");
  L.push("  planetMeshes.forEach(function(mesh){");
  L.push("    const dx=camera.position.x-mesh.position.x,dz=camera.position.z-mesh.position.z;");
  L.push("    mesh.rotation.y=Math.atan2(dx,dz);");
  L.push("  });");
  L.push("}");

  L.push("function update(){");
  L.push("  if(gameState!=='flying') return;");
  L.push("  frame++;");
  L.push("  if(updateSearchFlight()){updateLOD();billboardCubes();if(frame%4===0){updateHUD();pulseSearchlight();}return;}");
  L.push("  applyNavHold();");
  L.push("  yaw+=yawVel+navState.yaw;navState.yaw=0;pitch=Math.max(-PITCH_LIMIT,Math.min(PITCH_LIMIT,pitch+pitchVel));");
  L.push("  camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));");
  L.push("  if(navState.panX||navState.panY){camera.translateX(navState.panX);camera.translateY(navState.panY);navState.panX=0;navState.panY=0;}");
  L.push("  if(navState.orbit){orbitCamera(navState.orbit);navState.orbit=0;camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));}");
  L.push("  camera.translateZ(-speed);");
  L.push("  yawVel*=0.85;pitchVel*=0.85;");
  L.push("  updateTarget();updateLOD();billboardCubes();");
  L.push("  if(targeted&&speed>0.3){");
  L.push("    const td=camera.position.distanceTo(targeted.position);");
  L.push("    if(td<220) speed*=0.965;");
  L.push("  }");
  L.push("  if(frame%10===0) checkZoneEntry();");
  L.push("  if(frame%4===0) updateHUD();");
  L.push("}");

  L.push("function drawMenuBg(){}");
  L.push("function loop(){if(!contextLost){update();updateFocus();pulseSearchlight();renderer.render(scene,camera);}requestAnimationFrame(loop);}");

  L.push("function startFlying(){");
  L.push("  if(LAYOUT.links.length===0){alert('Add some links at /admin first');return;}");
  L.push("  gameState='flying';");
  L.push("  document.getElementById('menuUI').style.display='none';");
  L.push("  document.getElementById('flyUI').style.display='flex';");
  L.push("  document.getElementById('hud').style.display='block';");
  L.push("  bindFlightHud();updateHUD();");
  L.push("  setTimeout(function(){showToast('Flight HUD ready: searchlight online');},800);");
  L.push("}");

  L.push("initScene();loop();");
  return L.join("\n");
}

// =================== HTML ===================

function buildGameHTML(layout){
  const script=buildGameScript(layout);
  const parts=[
    "<!DOCTYPE html>",
    "<html lang='en'><head>",
    "<meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover'>",
    "<title>Link Lane</title>",
    "<style>",
    "*{margin:0;padding:0;box-sizing:border-box;}",
    "body{background:#000;display:flex;flex-direction:column;align-items:center;min-height:100vh;min-height:100dvh;font-family:monospace;overflow:hidden;padding-top:env(safe-area-inset-top);}",
    "#loadScreen{position:fixed;top:0;left:0;width:100%;height:100%;height:100dvh;background:radial-gradient(ellipse at center,#0a0a1a 0%,#000 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1000;transition:opacity 0.7s ease-out;}",
    "#loadScreen.fadeOut{opacity:0;}",
    "#loadLogo{font-size:2.2rem;font-weight:200;background:linear-gradient(45deg,#00ffff,#0088ff,#ff00ff);background-size:300% 300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:14px;animation:gradientShift 3s ease-in-out infinite;}",
    "#loadText{color:#00ffff;font-size:0.85rem;opacity:0.8;margin-bottom:20px;}",
    "#loadBarTrack{width:220px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;}",
    "#loadBar{height:100%;width:0%;background:linear-gradient(90deg,#00ffff,#0088ff);box-shadow:0 0 12px rgba(0,255,255,0.6);animation:loadProgress 1.1s ease-out forwards;}",
    "@keyframes gradientShift{0%,100%{background-position:0% 50%;}50%{background-position:100% 50%;}}",
    "@keyframes loadProgress{from{width:0%;}to{width:100%;}}",
    "#toast{position:fixed;top:14%;left:50%;transform:translateX(-50%) translateY(-12px);background:rgba(0,20,15,0.9);color:#00ff88;border:1px solid rgba(0,255,136,0.4);padding:8px 18px;border-radius:20px;font-size:12px;z-index:300;opacity:0;transition:all 0.35s ease;pointer-events:none;white-space:nowrap;backdrop-filter:blur(10px);}",
    "#toast.show{opacity:1;transform:translateX(-50%) translateY(0);}",
    "#wrap{position:relative;width:100%;max-width:480px;height:62vh;height:62dvh;background:#000;}",
    "#gc{display:block;width:100%;height:100%;touch-action:none;}",
    "#hud{display:none;position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}",
    "#crosshair{position:absolute;top:50%;left:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid rgba(255,255,255,0.4);border-radius:50%;transition:border-color 0.15s,transform 0.15s;}",
    "#crosshair.locked{border-color:#00ff88;transform:scale(1.3);box-shadow:0 0 14px rgba(0,255,136,0.6);}",
    "#targetHint{display:none;position:absolute;top:54%;left:50%;transform:translateX(-50%);color:#00ff88;font-size:12px;background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:4px;white-space:nowrap;}",
    "#compass{position:absolute;top:50%;left:50%;width:0;height:0;display:none;}",
    "#compass:before{content:'\u25B2';position:absolute;left:-150px;top:-10px;color:#ffdd00;font-size:14px;}",
    "#compassLabel{position:absolute;top:8px;left:50%;transform:translateX(-50%);color:#ffdd00;font-size:11px;background:rgba(0,0,0,0.55);padding:2px 8px;border-radius:4px;white-space:nowrap;}",
    "#cockpitBottom{position:absolute;bottom:0;left:0;width:100%;height:14%;background:linear-gradient(to top, rgba(10,10,15,0.85), transparent);}",
    "#shipIcon{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:26px;opacity:0.85;}",
    "#menuUI{width:100%;max-width:480px;background:rgba(0,0,0,0.85);border-top:1px solid rgba(0,255,255,0.2);backdrop-filter:blur(20px);padding:14px 16px;display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;}",
    "#menuUI h1{color:#00ff88;font-size:22px;}",
    "#menuUI p{color:#4488aa;font-size:12px;}",
    "#startBtn{background:#00ff88;color:#000;border:none;padding:14px 36px;font-family:monospace;font-size:16px;font-weight:bold;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#statBadge{color:#00ff88;font-size:12px;background:rgba(0,255,136,0.1);border:1px solid #00ff88;padding:6px 14px;border-radius:6px;}",
    "#flyUI{width:100%;max-width:480px;background:rgba(0,0,0,0.88);border-top:1px solid rgba(0,255,255,0.2);backdrop-filter:blur(20px);padding:8px 10px calc(8px + env(safe-area-inset-bottom));display:none;flex-direction:column;gap:6px;}",
    ".fmtRow{display:flex;gap:5px;justify-content:center;}",
    ".flightHud{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid rgba(0,255,255,0.22);border-radius:12px;background:linear-gradient(180deg,rgba(0,20,28,0.72),rgba(0,5,12,0.72));box-shadow:0 0 18px rgba(0,255,255,0.12) inset,0 0 22px rgba(0,255,255,0.08);}",
    ".searchDeck{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid rgba(0,255,136,0.22);border-radius:12px;background:linear-gradient(180deg,rgba(0,24,16,0.72),rgba(0,5,12,0.72));box-shadow:0 0 18px rgba(0,255,136,0.10) inset;}",
    ".searchTop{display:flex;gap:6px;align-items:center;}",
    ".searchIcon,.searchClear,.searchBtn{background:rgba(0,255,136,0.10);color:#9fdbb9;border:1px solid rgba(0,255,136,0.34);font-family:monospace;font-weight:bold;border-radius:10px;min-height:40px;padding:0 10px;touch-action:manipulation;}",
    ".searchIcon{min-width:44px;font-size:16px;}",
    ".searchInput{flex:1;min-width:0;background:rgba(0,0,0,0.55);color:#dff;border:1px solid rgba(0,255,255,0.24);border-radius:10px;min-height:40px;padding:0 10px;font-family:monospace;font-size:13px;outline:none;}",
    ".searchInput:focus{border-color:#00ff88;box-shadow:0 0 12px rgba(0,255,136,0.18);}",
    ".searchControls{display:flex;gap:6px;align-items:center;}",
    "#searchCount{flex:1;color:#00ff88;font-size:11px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".searchDeck:not(.open){align-self:center;padding:4px;border-color:rgba(0,255,136,0.16);background:transparent;box-shadow:none;}",
    ".searchDeck:not(.open) .searchInput,.searchDeck:not(.open) .searchClear,.searchDeck:not(.open) .searchControls{display:none;}",
    ".searchDeck.open .searchIcon{background:rgba(0,255,136,0.24);color:#fff;box-shadow:0 0 12px rgba(0,255,136,0.22);}",
    ".flightRow{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}",
    ".flightRow.travel{grid-template-columns:repeat(5,1fr);}",
    ".flightBtn{min-height:44px;background:rgba(0,255,255,0.07);color:#9ff;border:1px solid rgba(0,255,255,0.28);font-family:monospace;font-size:10px;font-weight:bold;border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:none;user-select:none;letter-spacing:.02em;}",
    ".flightBtn:active,.flightBtn.held{background:rgba(0,255,255,0.22);color:#fff;box-shadow:0 0 14px rgba(0,255,255,0.28);transform:translateY(1px);}",
    ".flightBtn.speedBtn{background:rgba(0,255,136,0.08);border-color:rgba(0,255,136,0.35);color:#9fdbb9;}",
    ".flightBtn.stopBtn{background:rgba(170,30,30,0.2);border-color:#bb3333;color:#ff7777;}",
    "#flightStatus{color:#00ff88;font-size:11px;text-align:center;letter-spacing:.06em;text-transform:uppercase;min-height:16px;}",
    "@media(max-height:700px){#wrap{height:55dvh}.flightBtn{min-height:40px;font-size:9px}#flyUI{gap:4px;padding-top:6px}}", 
    ".clusterBtn{background:rgba(255,140,0,0.06);color:#fa8;border:1px solid rgba(255,140,0,0.3);font-size:11px;padding:6px 12px;border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:monospace;flex:1;}",
    ".clusterBtn.active{background:rgba(255,140,0,0.25);border-color:#ff8c00;color:#fff;box-shadow:0 0 10px rgba(255,140,0,0.3);}",
    ".fmtBtn{background:rgba(0,255,255,0.06);color:#7ab;border:1px solid rgba(0,255,255,0.25);font-size:10px;padding:5px 10px;border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:monospace;}",
    ".fmtBtn.active{background:rgba(0,255,255,0.25);border-color:#00ffff;color:#fff;box-shadow:0 0 10px rgba(0,255,255,0.3);}",

    "#adminLink{color:#222;font-size:10px;padding:4px;text-align:center;width:100%;max-width:480px;}",
    "#adminLink a{color:#222;}",
    "#focusBar{display:none;position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(0,0,0,0.88);border-top:1px solid rgba(0,255,136,0.35);backdrop-filter:blur(14px);padding:12px 16px calc(12px + env(safe-area-inset-bottom));flex-direction:column;gap:10px;z-index:250;}",
    "#fbTitle{color:#fff;font-size:13px;text-align:center;max-height:3em;overflow:hidden;}",
    ".fbRow{display:flex;gap:8px;}",
    "#fbVisit{flex:2;padding:12px;background:#00ff88;color:#000;border:none;font-family:monospace;font-size:14px;font-weight:bold;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#fbClose{flex:1;padding:12px;background:transparent;color:#888;border:1px solid #333;font-family:monospace;font-size:13px;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#ov{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.97);z-index:200;flex-direction:column;align-items:center;justify-content:center;padding:20px;}",
    "#ovImg{max-width:100%;max-height:42vh;object-fit:contain;border-radius:4px;margin-bottom:14px;}",
    "#ovTitle{color:#fff;font-size:16px;text-align:center;margin-bottom:8px;max-width:90%;}",
    "#ovDesc{color:#888;font-size:12px;text-align:center;max-width:90%;line-height:1.6;margin-bottom:8px;}",
    "#ovDomain{color:#00ff88;font-size:11px;margin-bottom:18px;}",
    "#ovVisit{padding:12px 32px;background:#00ff88;color:#000;border:none;font-family:monospace;font-size:15px;font-weight:bold;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;margin-bottom:10px;}",
    "#ovClose{padding:10px 28px;background:transparent;color:#666;border:1px solid #333;font-family:monospace;font-size:13px;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;}",    "#contentVisor{position:fixed;inset:0;background:#05070d;color:#edf7ff;z-index:1600;display:flex;flex-direction:column;padding:calc(12px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));transform:translateY(100%);opacity:0;pointer-events:none;transition:transform .28s ease,opacity .24s ease;}",
    "#contentVisor.open{transform:translateY(0);opacity:1;pointer-events:auto;}",
    "#cvTop{position:sticky;top:0;z-index:2;background:#05070d;border-bottom:1px solid rgba(0,255,136,.35);box-shadow:0 12px 28px rgba(0,255,136,.08);padding-bottom:10px;}",
    "#cvReturn{width:100%;background:#00ff88;color:#00120a;border:0;border-radius:10px;font-family:monospace;font-weight:bold;font-size:15px;padding:13px 14px;margin-bottom:10px;cursor:pointer;}",
    "#cvTitle{font-size:18px;line-height:1.25;font-weight:bold;color:#fff;max-height:3.8em;overflow:hidden;}",
    "#cvDomain{font-size:11px;color:#00ff88;margin-top:5px;letter-spacing:.08em;text-transform:uppercase;}",
    "#cvBody{width:100%;max-width:900px;margin:0 auto;flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px 0 22px;}",
    ".cvFrameWrap{width:100%;background:#000;border:1px solid rgba(0,255,136,.25);border-radius:14px;overflow:hidden;aspect-ratio:16/9;box-shadow:0 0 36px rgba(0,255,136,.12);}",
    ".cvFrameWrap iframe{width:100%;height:100%;border:0;display:block;}",
    ".cvHero{width:100%;max-height:38vh;object-fit:cover;border-radius:14px;margin-bottom:14px;border:1px solid rgba(255,255,255,.08);}",
    ".cvDesc{color:#b7d0dc;font-size:15px;line-height:1.65;margin:0 0 16px;}",
    ".cvArticle{background:#0b1018;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px;box-shadow:0 0 24px rgba(0,0,0,.3);}",
    ".cvArticle p{font-family:ui-serif,Georgia,serif;font-size:17px;line-height:1.78;color:#e8eef6;margin:0 0 17px;}",
    ".cvLoading,.cvFallback,.cvNote{background:#0b1018;border:1px solid rgba(0,255,136,.2);border-radius:14px;padding:18px;color:#a9c4cf;line-height:1.6;}",
    "#cvActions{display:flex;gap:10px;width:100%;max-width:900px;margin:0 auto;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);}",
    "#cvOpenOriginal{flex:1;text-align:center;text-decoration:none;background:transparent;color:#00ff88;border:1px solid rgba(0,255,136,.45);border-radius:10px;font-family:monospace;font-weight:bold;padding:12px;}",
    "#cvCloseBottom{flex:1;background:#111927;color:#cfe8f5;border:1px solid rgba(255,255,255,.12);border-radius:10px;font-family:monospace;font-weight:bold;padding:12px;}",
    "</style></head><body>",
    "<div id='loadScreen'><div id='loadLogo'>LINK LANE</div><div id='loadText'>Initializing flight systems</div><div id='loadBarTrack'><div id='loadBar'></div></div></div>",
    "<div id='toast'></div>",
    "<div id='wrap'><canvas id='gc'></canvas>",
    "<div id='hud'>",
    "  <div id='crosshair'></div><div id='targetHint'></div>",
    "  <div id='compassLabel'></div><div id='compass'></div>",
    "  <div id='cockpitBottom'></div><div id='shipIcon'>\uD83D\uDE80</div>",
    "</div></div>",
    "<div id='menuUI'>",
    "  <h1>\uD83D\uDD17 LINK LANE</h1>",
    "  <p>fly through your bookmarks</p>",
    "  <div id='statBadge'>"+(layout.links.length>0 ? layout.links.length+" links across "+layout.galaxies.length+" galaxies" : "add links at /admin to begin")+"</div>",
    "  <button id='startBtn' onclick='startFlying()'>LAUNCH \uD83D\uDE80</button>",
    "</div>",
    "<div id='flyUI'>",
    "  <div class='fmtRow'>",
    "    <button class='clusterBtn active' data-c='galaxies' onclick='setClusterMode(\"galaxies\")'>\uD83C\uDF10 Galaxies</button>",
    "    <button class='clusterBtn' data-c='supercluster' onclick='setClusterMode(\"supercluster\")'>\uD83C\uDF0C Supercluster</button>",
    "  </div>",
    "  <div class='fmtRow'>",
    "    <button class='fmtBtn active' data-f='sphere' onclick='applyFormation(\"sphere\")'>Sphere</button>",
    "    <button class='fmtBtn' data-f='spiral' onclick='applyFormation(\"spiral\")'>Spiral</button>",
    "    <button class='fmtBtn' data-f='cube' onclick='applyFormation(\"cube\")'>Cube</button>",
    "    <button class='fmtBtn' data-f='torus' onclick='applyFormation(\"torus\")'>Torus</button>",
    "  </div>",
    "  <div id='flightHud' class='flightHud' aria-label='Mobile Flight HUD'>",
    "  <div id='searchDeck' class='searchDeck' aria-label='Cosmic Searchlight'>",
    "    <div class='searchTop'>",
    "      <button type='button' id='searchToggle' class='searchIcon' onclick='toggleSearchDeck()'>⌕</button>",
    "      <input id='searchInput' class='searchInput' type='search' inputmode='search' placeholder='Search AI, WebAssembly, arXiv...' oninput='updateSearchQuery(this.value)' onfocus='toggleSearchDeck(true)'>",
    "      <button type='button' class='searchClear' onclick='clearSearch()'>×</button>",
    "    </div>",
    "    <div class='searchControls'>",
    "      <span id='searchCount'>Searchlight ready</span>",
    "      <button type='button' class='searchBtn' onclick='nextSearchResult()'>Next</button>",
    "      <button type='button' class='searchBtn' onclick='flyToSearchResult()'>Fly</button>",
    "    </div>",
    "  </div>",
    "    <div class='flightRow'>",
    "      <button type='button' class='flightBtn orbitBtn' data-nav='orbitLeft'>⟲ ORBIT</button>",
    "      <button type='button' class='flightBtn turnBtn' data-nav='turnLeft'>◀ TURN</button>",
    "      <button type='button' class='flightBtn turnBtn' data-nav='turnRight'>TURN ▶</button>",
    "      <button type='button' class='flightBtn orbitBtn' data-nav='orbitRight'>ORBIT ⟳</button>",
    "    </div>",
    "    <div class='flightRow travel'>",
    "      <button type='button' class='flightBtn panBtn' data-nav='panLeft'>◀ PAN</button>",
    "      <button type='button' class='flightBtn speedBtn' data-nav='speedDown'>− SPD</button>",
    "      <button type='button' class='flightBtn stopBtn' data-nav='stop'>■ STOP</button>",
    "      <button type='button' class='flightBtn speedBtn' data-nav='speedUp'>+ SPD</button>",
    "      <button type='button' class='flightBtn panBtn' data-nav='panRight'>PAN ▶</button>",
    "    </div>",
    "    <div id='flightStatus'>speed: 0.0x / cruise off</div>",
    "  </div>",
    "</div>",
    "<div id='adminLink'><a href='/admin'>add links</a></div>",
    "<div id='focusBar'>",
    "  <div id='fbTitle'></div>",
    "  <div class='fbRow'><button id='fbVisit'>Visit \u2192</button><button id='fbClose' onclick='closeFocus()'>\u2715 Close</button></div>",
    "</div>",
    "<div id='ov'>",
    "  <img id='ovImg' src='' alt='preview'>",
    "  <div id='ovTitle'></div>",
    "  <div id='ovDesc'></div>",
    "  <div id='ovDomain'></div>",
    "  <button id='ovVisit'>Visit Site \u2192</button>",
    "  <button id='ovClose' onclick='closeLink()'>\u2190 back to space</button>",
    "</div>",
    "<div id='contentVisor' aria-hidden='true'>",
    "  <div id='cvTop'>",
    "    <button id='cvReturn' onclick='closeContentVisor()'>\\u2190 Return to Universe</button>",
    "    <div id='cvTitle'>Content Visor</div>",
    "    <div id='cvDomain'>Reader Engine</div>",
    "  </div>",
    "  <main id='cvBody'></main>",
    "  <div id='cvActions'><a id='cvOpenOriginal' href='#' target='_blank' rel='noopener'>Open Original \\u2197</a><button id='cvCloseBottom' onclick='closeContentVisor()'>Return</button></div>",
    "</div>",    "<script src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'></script>",
    "<script>",
    script,
    "</script>",
    "</body></html>"
  ];
  return parts.join("\n");
}

// =================== ADMIN ===================

function buildAdminHTML(links){
  const grid=links.slice(0,60).map(function(l){
    return "<div style='background:#06040c;border:1px solid #1a1a2a;border-radius:5px;padding:8px;display:flex;gap:8px;align-items:center;'>"+
      (l.og_image_key?"<img src='/og-image/"+safe(l.id)+"' style='width:50px;height:50px;object-fit:cover;border-radius:4px;flex-shrink:0;'>":"<div style='width:50px;height:50px;background:#111;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;'>\uD83D\uDD17</div>")+
      "<div style='flex:1;overflow:hidden;'><div style='color:#ccc;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>"+safe(l.title||l.url)+"</div><div style='color:#00ff88;font-size:10px;'>"+safe(l.domain)+"</div></div>"+
      "<button onclick=\"del('"+safe(l.id)+"')\" style='background:#440000;color:#f88;border:1px solid #600;padding:6px 10px;border-radius:4px;cursor:pointer;font-family:monospace;flex-shrink:0;'>x</button>"+
      "</div>";
  }).join("");
  const parts=[
    "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<title>Link Lane - Add Links</title>",
    "<style>body{background:#06040c;color:#aaa;font-family:monospace;padding:20px;max-width:600px;margin:0 auto;}h1{color:#00ff88;font-size:20px;margin-bottom:4px;}h2{color:#ffdd00;margin:18px 0 8px;font-size:13px;}a{color:#00ff88;}textarea{width:100%;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:10px;font-family:monospace;font-size:14px;min-height:100px;margin-bottom:8px;}button.go{background:#00ff88;color:#000;border:none;padding:12px 24px;font-family:monospace;font-size:15px;font-weight:bold;border-radius:6px;cursor:pointer;width:100%;margin-bottom:6px;}.note{color:#444;font-size:11px;line-height:1.6;margin-bottom:10px;}#msg{padding:10px;margin:6px 0;border-radius:4px;display:none;}.ok{background:#003300;color:#4f4;border:1px solid #4f4;}.er{background:#330000;color:#f44;border:1px solid #f44;}#progLabel{color:#666;font-size:11px;margin-bottom:6px;display:none;}.grid{display:flex;flex-direction:column;gap:6px;}</style>",
    "</head><body>",
    "<h1>\uD83D\uDD17 Link Lane</h1>",
    "<a href='/'>\u2190 back to game</a>",
    "<h2>Auto Feed Sync</h2>",
    "<p class='note'>Cron keeps registered RSS/Open RSS sources fresh. Run a manual sync now to add nodes immediately instead of waiting for the next scheduled update.</p>",
    "<div id='syncMsg'></div>",
    "<button class='go' onclick='syncFeeds()'>Sync Registered Feeds ⚡</button>",    "<h2>Add an RSS/Article Feed Group</h2>",
    "<p class='note'>Any site with an RSS or Atom feed works - news, blogs, podcasts, tech/science publications. Paste the feed URL directly (not the site's homepage).</p>",
    "<div id='fdMsg'></div>",
    "<input id='fdInput' placeholder='https://example.com/feed/' style='width:100%;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:10px;font-family:monospace;font-size:14px;margin-bottom:8px;'>",
    "<input id='fdName' placeholder='Group name (optional - auto-detected from feed)' style='width:100%;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:10px;font-family:monospace;font-size:14px;margin-bottom:8px;'>",
    "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px;'>",
    "  <label style='color:#666;font-size:11px;'>items:</label>",
    "  <input id='fdMax' type='number' value='15' min='1' max='30' style='width:60px;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:8px;font-family:monospace;'>",
    "</div>",
    "<button class='go' onclick='addFeed()'>Add Feed Group \uD83D\uDCF0</button>",
    "<h2>Add a YouTube Channel Group</h2>",
    "<p class='note'>Paste a channel URL, @handle, or UC... channel ID. Pulls that channel's newest uploads straight from its public RSS feed (no API key) and drops them into their own 3D galaxy.</p>",
    "<div id='chMsg'></div>",
    "<input id='chInput' placeholder='@PowerfulJRE or https://youtube.com/@channel' style='width:100%;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:10px;font-family:monospace;font-size:14px;margin-bottom:8px;'>",
    "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px;'>",
    "  <label style='color:#666;font-size:11px;'>videos:</label>",
    "  <input id='chMax' type='number' value='15' min='1' max='25' style='width:60px;background:#000;color:#ccc;border:1px solid #1a1a2a;border-radius:4px;padding:8px;font-family:monospace;'>",
    "</div>",
    "<button class='go' onclick='addChannel()'>Add Channel Group \uD83D\uDCFA</button>",
    "<h2>Add Individual Links</h2>",
    "<p class='note'>Paste one URL per line. Each one's real preview image and title are fetched automatically (the same image you'd see in an iMessage or Slack link preview).</p>",
    "<div id='msg'></div>",
    "<div id='progLabel'></div>",
    "<textarea id='urlsInput' placeholder='https://example.com&#10;https://another-site.com/page'></textarea>",
    "<button class='go' onclick='addLinks()'>Add Links \u2191</button>",
    "<h2>Your Links ("+links.length+")</h2>",
    links.length?"<div class='grid'>"+grid+"</div>":"<p style='color:#333;font-size:12px;'>None added yet.</p>",
    "<script>",
    "function msg(t,ok){const d=document.getElementById('msg');d.textContent=t;d.className=ok?'ok':'er';d.style.display='block';setTimeout(function(){d.style.display='none';},6000);}",
    "function chMsg(t,ok){const d=document.getElementById('chMsg');d.textContent=t;d.className=ok?'ok':'er';d.style.display='block';}",
    "function fdMsg(t,ok){const d=document.getElementById('fdMsg');d.textContent=t;d.className=ok?'ok':'er';d.style.display='block';}",
    "function syncMsg(t,ok){const d=document.getElementById('syncMsg');d.textContent=t;d.className=ok?'ok':'er';d.style.display='block';}",
    "async function syncFeeds(){",
    "  const btn=document.querySelector('button[onclick=\\\"syncFeeds()\\\"]');btn.disabled=true;btn.textContent='Syncing feeds...';",
    "  try{",
    "    const r=await fetch('/admin/sync-feeds?source_limit=12&item_limit=35');",
    "    const d=await r.json();",
    "    if(d.ok) syncMsg('Synced '+d.sources_checked+' source(s): '+d.items_added+' added, '+d.items_skipped+' skipped. Total nodes: '+d.total_nodes+'. Refresh game to fly them.',true);",
    "    else syncMsg(d.error||'Feed sync failed',false);",
    "  }catch(e){syncMsg('Request failed: '+e.message,false);}",
    "  btn.disabled=false;btn.textContent='Sync Registered Feeds ⚡';",
    "}",    "async function addFeed(){",
    "  const feedUrl=document.getElementById('fdInput').value.trim();",
    "  const name=document.getElementById('fdName').value.trim();",
    "  const max=document.getElementById('fdMax').value||15;",
    "  if(!feedUrl){fdMsg('Enter a feed URL',false);return;}",
    "  const btn=document.querySelector('button[onclick=\"addFeed()\"]');btn.disabled=true;btn.textContent='Fetching feed...';",
    "  try{",
    "    const r=await fetch('/admin/add-feed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feed_url:feedUrl,name:name||undefined,max:Number(max)})});",
    "    const d=await r.json();",
    "    if(d.ok) fdMsg('Added '+d.added+' item(s) from \"'+d.feed+'\"'+(d.skipped?(' ('+d.skipped+' already had)'):'')+'. Refresh game to see the new galaxy.',true);",
    "    else fdMsg(d.error||'Failed to add feed',false);",
    "  }catch(e){fdMsg('Request failed: '+e.message,false);}",
    "  btn.disabled=false;btn.textContent='Add Feed Group \uD83D\uDCF0';",
    "}",
    "async function addChannel(){",
    "  const input=document.getElementById('chInput').value.trim();",
    "  const max=document.getElementById('chMax').value||15;",
    "  if(!input){chMsg('Enter a channel URL or handle',false);return;}",
    "  const btn=document.querySelector('button[onclick=\"addChannel()\"]');btn.disabled=true;btn.textContent='Fetching channel...';",
    "  try{",
    "    const r=await fetch('/admin/add-channel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:input,max:Number(max)})});",
    "    const d=await r.json();",
    "    if(d.ok) chMsg('Added '+d.added+' video(s) from \"'+d.channel+'\"'+(d.skipped?(' ('+d.skipped+' already had)'):'')+'. Refresh game to see the new galaxy.',true);",
    "    else chMsg(d.error||'Failed to add channel',false);",
    "  }catch(e){chMsg('Request failed: '+e.message,false);}",
    "  btn.disabled=false;btn.textContent='Add Channel Group \uD83D\uDCFA';",
    "}",
    "function setProg(t){const p=document.getElementById('progLabel');p.textContent=t;p.style.display=t?'block':'none';}",
    "async function addLinks(){",
    "  const lines=document.getElementById('urlsInput').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean);",
    "  if(!lines.length){msg('No URLs entered',false);return;}",
    "  const btn=document.querySelector('button.go');btn.disabled=true;",
    "  let done=0,errors=0;",
    "  for(const url of lines){",
    "    setProg('Fetching '+(done+errors+1)+' / '+lines.length+'...');",
    "    try{const r=await fetch('/admin/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url})});const d=await r.json();if(d.ok)done++;else errors++;}catch(e){errors++;}",
    "  }",
    "  setProg('');btn.disabled=false;",
    "  if(errors) msg('Added '+done+', '+errors+' failed',done>0);",
    "  else msg('Added '+done+' link'+(done===1?'':'s')+'! Refresh game to see them.',true);",
    "}",
    "function del(id){if(!confirm('Remove this link?'))return;fetch('/admin/link/'+id,{method:'DELETE'}).then(function(r){return r.json();}).then(function(d){if(d.ok)location.reload();}).catch(function(){});}",
    "</script>",
    "</body></html>"
  ];
  return parts.join("\n");
}

// =================== API ===================

async function apiAddLink(env,req){
  const body=await req.json().catch(()=>({}));
  const url=body.url;
  if(!url) return j({ok:false,error:"url required"},400);
  let normalizedUrl=url;
  if(!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl="https://"+normalizedUrl;
  const id=uid();
  let title=normalizedUrl,description="",ogImageKey=null;
  try{
    const preview=await fetchLinkPreview(normalizedUrl);
    title=preview.title;description=preview.description;
    if(preview.ogImageUrl) ogImageKey=await storeOgImage(env,id,preview.ogImageUrl);
  }catch(e){
    // Still save the link even if preview fetch failed - just without an image
  }
  const vidId=youtubeVideoId(normalizedUrl);
  let isShort=0,finalUrl=normalizedUrl;
  if(vidId){
    isShort=(await detectShort(vidId))?1:0;
    if(isShort) finalUrl="https://www.youtube.com/shorts/"+vidId;
  }
  const domain=domainOf(finalUrl);
  await env.DB.prepare("INSERT INTO links (id,url,title,description,domain,og_image_key,video_id,is_short) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id,finalUrl,title,description,domain,ogImageKey,vidId,isShort).run();
  return j({ok:true,id,domain,has_image:Boolean(ogImageKey),is_short:Boolean(isShort)});
}

async function apiOgImage(env,id){
  const row=await env.DB.prepare("SELECT og_image_key FROM links WHERE id=?").bind(safe(id)).first();
  if(!row||!row.og_image_key) return new Response("Not found",{status:404});
  const obj=await env.BUCKET.get(row.og_image_key);
  if(!obj) return new Response("Not found",{status:404});
  return new Response(obj.body,{headers:{"Content-Type":obj.httpMetadata?.contentType||"image/jpeg","Cache-Control":"public, max-age=86400"}});
}

async function deleteLink(env,id){
  const row=await env.DB.prepare("SELECT og_image_key FROM links WHERE id=?").bind(safe(id)).first();
  if(row&&row.og_image_key) await env.BUCKET.delete(row.og_image_key);
  await env.DB.prepare("DELETE FROM links WHERE id=?").bind(safe(id)).run();
  return j({ok:true});
}

// =================== ROUTER ===================

export default {
  async scheduled(controller,env,ctx){
    ctx.waitUntil(syncConfiguredFeeds(env,{reason:"cron",sourceLimit:12,itemLimit:35,cron:controller.cron,scheduled_time:new Date(controller.scheduledTime).toISOString()}));
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(method==="GET"&&(path==="/"||path==="/admin")) maybeAutoSyncFeeds(env,ctx);
    if(method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
    if(path.startsWith("/og-image/")) return apiOgImage(env,decodeURIComponent(path.slice(10)));
    if(path==="/admin"&&method==="GET"){
      const r=await env.DB.prepare("SELECT id,url,title,domain,og_image_key,group_name,is_short FROM links ORDER BY added_at DESC LIMIT "+MAX_UNIVERSE_NODES).all();
      return new Response(buildAdminHTML(r.results||[]),{headers:{"Content-Type":"text/html;charset=UTF-8"}});
    }
    if(path==="/admin/add"&&method==="POST") return apiAddLink(env,request);
    if(path==="/admin/add-channel"&&method==="POST") return apiAddChannel(env,request);
    if(path==="/admin/add-feed"&&method==="POST") return apiAddFeed(env,request);
    if(path==="/admin/sync-feeds"&&(method==="GET"||method==="POST")) return apiSyncFeeds(env,request);
    if(path==="/admin/feed-sources"&&method==="GET") return apiFeedSources(env);
    if(path==="/api/import-feeds"&&(method==="GET"||method==="POST")) return apiSyncFeeds(env,request);
    if(path==="/api/feed-sources"&&method==="GET") return apiFeedSources(env);
    if(path.startsWith("/admin/link/")&&method==="DELETE") return deleteLink(env,decodeURIComponent(path.slice(12)));
    if(path==="/content/read"&&method==="GET") return apiReaderView(env,request);
    if(path==="/health") return j({ok:true,worker:WORKER_NAME,version:VERSION});
    if(path==="/admin/setup"&&method==="POST"){
      const results=[];
      for(const sql of SCHEMA){try{await env.DB.prepare(sql).run();results.push({ok:true});}catch(e){results.push({ok:false,error:e.message});}}
      return j({ok:true,results});
    }
    if(path==="/"||path===""){
      const r=await env.DB.prepare("SELECT id,url,title,description,domain,og_image_key,group_name,video_id,is_short,published_at,added_at FROM links ORDER BY COALESCE(group_name,domain), added_at LIMIT "+MAX_UNIVERSE_NODES).all();
      const layout=layoutLinks(r.results||[]);
      return new Response(buildGameHTML(layout),{headers:{"Content-Type":"text/html;charset=UTF-8"}});
    }
    return j({error:"Not found"},404);
  }
};