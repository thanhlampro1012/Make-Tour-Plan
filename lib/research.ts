import { type SourceReference, uid, mapsUrl } from "./travel";

export type TravelMode = "driving" | "walking" | "transit" | "bicycling" | "two-wheeler";
export const travelModes: {value:TravelMode;label:string}[] = [
  {value:"driving",label:"Ô tô / taxi"},{value:"walking",label:"Đi bộ"},{value:"transit",label:"Công cộng"},{value:"two-wheeler",label:"Xe máy"},{value:"bicycling",label:"Xe đạp"},
];
export type ResearchPlatform = "maps" | "reddit" | "threads" | "facebook" | "youtube" | "web";
export interface ResearchLink {platform:ResearchPlatform;label:string;url:string;hint:string}
const clean=(text:string)=>text.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,300);
export function sourcePlatform(value:string):string {
  try {const host=new URL(value).hostname.toLowerCase().replace(/^www\./,"");
    if(host==="reddit.com"||host.endsWith(".reddit.com")||host==="redd.it")return "Reddit";
    if(host==="threads.com"||host.endsWith(".threads.com")||host==="threads.net"||host.endsWith(".threads.net"))return "Threads";
    if(host==="facebook.com"||host.endsWith(".facebook.com")||host==="fb.watch")return "Facebook";
    if(host==="youtube.com"||host.endsWith(".youtube.com")||host==="youtu.be")return "YouTube";
    if(host==="tiktok.com"||host.endsWith(".tiktok.com"))return "TikTok";
    if(host==="maps.app.goo.gl"||host==="maps.google.com"||(host==="google.com"&&new URL(value).pathname.startsWith("/maps")))return "Google Maps";
    return host;
  }catch{return "Website";}
}
export function communityLinks(name:string,city=""):ResearchLink[] {
  const query=clean(`${name} ${city}`); if(!query)return [];
  const google=(scope:string)=>`https://www.google.com/search?${new URLSearchParams({q:`${scope} ${query}`.trim()})}`;
  return [
    {platform:"maps",label:"Google Maps",url:mapsUrl(query,""),hint:"Vị trí, giờ mở cửa và đánh giá tại địa điểm"},
    {platform:"reddit",label:"Reddit",url:`https://www.reddit.com/search/?${new URLSearchParams({q:query})}`,hint:"Tìm các bài thảo luận có từ khóa này"},
    {platform:"threads",label:"Tìm bài Threads",url:google("site:threads.com"),hint:"Tìm bài Threads được công cụ tìm kiếm lập chỉ mục"},
    {platform:"facebook",label:"Tìm bài Facebook",url:google("site:facebook.com"),hint:"Tìm bài công khai được lập chỉ mục; nhóm kín không xuất hiện"},
    {platform:"youtube",label:"YouTube",url:`https://www.youtube.com/results?${new URLSearchParams({search_query:`${query} review`})}`,hint:"Xem video trải nghiệm và chú ý ngày đăng"},
    {platform:"web",label:"Tìm trên web",url:google("review"),hint:"Tìm thêm nguồn độc lập"},
  ];
}
export function directionsTo(name:string,address:string,mode:TravelMode="driving"):string {
  let destination=clean([name,address].filter(Boolean).join(", "));
  let url="";
  do {url=`https://www.google.com/maps/dir/?${new URLSearchParams({api:"1",destination,travelmode:mode})}`;if(url.length<=2048)return url;destination=Array.from(destination).slice(0,-1).join("");}while(destination);
  return "https://www.google.com/maps/";
}
export function referenceFromUrl(title:string,url:string,place="",notes=""):SourceReference {
  return {id:uid(),title:title.slice(0,180),url,place:place.slice(0,240),notes,read:false,addedOn:new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())};
}

/** A Reddit discussion is the same source when its slug or share query changes. */
export function sourceIdentity(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      const id = url.pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1];
      if (id) return `reddit:${id.toLowerCase()}`;
    }
    if (host === "redd.it" && /^\/[a-z0-9]+\/?$/i.test(url.pathname)) return `reddit:${url.pathname.replace(/\//g, "").toLowerCase()}`;
    url.hash = "";
    url.hostname = host;
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.href;
  } catch {
    return value.trim();
  }
}

