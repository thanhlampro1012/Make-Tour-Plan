import data from "./suggestions-data.json";
import { type Activity, type Category, type Place, addDays, uid } from "./travel";

export interface Suggestion {
  id:string; name:string; city:string; category:Category; address:string; description:string;
  vibes:string[]; indoor:boolean; visitMinutes:number; budgetMin:number|null; budgetMax:number|null;
  bestTime:string; tips:string; sourceUrl:string; sourceLabel:string; checkedAt:string; mapsQuery:string;
}
export const suggestions: Suggestion[] = data.places as Suggestion[];
export const discoveryMeta = data.meta;
export const discoveryCities = Array.from(new Set(suggestions.map(p=>p.city)));
export const discoveryVibes = ["Hẹn hò","Nhóm bạn","Chụp ảnh","Workshop","Vận động","Giải đố","Photobooth","Nghệ thuật","Ngày mưa","Ngoài trời"];
export const dayIdeas = [
  {id:"art-date",title:"Một buổi hẹn ở trung tâm",city:"TP.HCM",description:"Ngắm tranh, ăn một bữa thong thả, rồi đi bộ khi phố lên đèn.",startTime:"14:00",ids:["hcm-my-thuat","hcm-pizza-4ps","hcm-nguyen-hue"]},
  {id:"slow-morning",title:"Sài Gòn một sáng thật chậm",city:"TP.HCM",description:"Lướt sách, chụp vài tấm ảnh và dành thời gian ngồi cà phê.",startTime:"09:00",ids:["hcm-duong-sach","hcm-buu-dien","hcm-cong-ho-con-rua"]},
  {id:"sea-afternoon",title:"Một chiều gần biển",city:"Vũng Tàu",description:"Ghé bảo tàng trước, đi dạo khu Bãi Trước sau. Có thể thêm bữa tối theo khẩu vị.",startTime:"14:00",ids:["vt-bao-tang","vt-bai-truoc"]},
  {id:"dalat-morning",title:"Gặp Đà Lạt buổi sáng",city:"Đà Lạt",description:"Bắt đầu ở ga, dạo quảng trường rồi tự chọn một quán ăn gần đó.",startTime:"09:00",ids:["dl-ga-da-lat","dl-lam-vien"]},
] as const;
export function suggestedCost(p:Suggestion):number {return p.budgetMin===null||p.budgetMax===null?0:Math.round((p.budgetMin+p.budgetMax)/2/5000)*5000;}
export function suggestionNotes(p:Suggestion):string {
  return `${p.description}\n\n${p.tips}\n\nGợi ý xếp lịch: ${p.bestTime}. Thời lượng và chi phí là dự trù, không phải giá/giờ mở cửa trực tiếp.\nNguồn: ${p.sourceLabel} · đối chiếu ${p.checkedAt}: ${p.sourceUrl}`;
}
export function suggestionPlace(p:Suggestion):Place {return {id:uid(),name:p.name,address:p.address,category:p.category,url:p.sourceUrl,notes:suggestionNotes(p),visited:false};}
export function suggestionActivity(p:Suggestion,date:string,startTime="09:00"):Activity {
  const [h,m]=startTime.split(":").map(Number);const end=h*60+m+p.visitMinutes;
  return {id:uid(),title:p.name,date,startTime,endTime:`${String(Math.floor(end/60)%24).padStart(2,"0")}:${String(end%60).padStart(2,"0")}`,endNextDay:end>=1440,category:p.category,place:p.name,address:p.address,transport:"Tự chọn phương tiện",travelMinutes:0,cost:suggestedCost(p),actualCost:null,perPerson:true,status:"planned",notes:suggestionNotes(p),bookingId:"",url:p.sourceUrl,priority:"normal",backup:p.indoor?"Kiểm tra lịch hoạt động và xác nhận chỗ trước khi đi.":"Nếu mưa: chọn một gợi ý trong nhà ở mục Khám phá, rồi sửa lịch cho phù hợp."};
}
export function buildDayIdea(ids:readonly string[],date:string,startTime:string):Activity[] {
  const [h,m]=startTime.split(":").map(Number);let cursor=h*60+m;
  return ids.map((id,index)=>{const p=suggestions.find(x=>x.id===id);if(!p)throw new Error("Địa điểm gợi ý không còn trong danh sách.");if(index)cursor+=25;const day=addDays(date,Math.floor(cursor/1440));const clock=`${String(Math.floor(cursor/60)%24).padStart(2,"0")}:${String(cursor%60).padStart(2,"0")}`;const a=suggestionActivity(p,day,clock);a.travelMinutes=index?25:0;a.notes+="\nKhoảng di chuyển 25 phút giữa các điểm chỉ là chỗ trống dự trù. Kiểm tra Maps và điều chỉnh trước khi đi.";cursor+=p.visitMinutes;return a;});
}
