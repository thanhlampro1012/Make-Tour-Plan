"use client";

import { useState } from "react";
import { Bookmark, BookOpen, Check, CheckCircle2, ChevronDown, Compass, ExternalLink, Link2, MapPin, Navigation, Pencil, Plus, Search } from "lucide-react";
import { type SourceReference, type Trip, mapsUrl, normalizeSearch } from "../lib/travel";
import { communityLinks, sourceIdentity, directionsTo, referenceFromUrl as sourceFromUrl, sourcePlatform, travelModes, type ResearchLink, type TravelMode } from "../lib/research";
import communityData from "../lib/community-data.json";

type Discussion = typeof communityData[number];
type SourcesPanelProps = {
  trip: Trip;
  onAdd: () => void;
  onEdit: (reference: SourceReference) => void;
  onToggle: (reference: SourceReference) => void;
  onSaveDiscussion: (reference: SourceReference) => void;
};

const dateText = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value;
const cityOptions = [...new Set(communityData.map(source => source.city))];

function searchLabel(link: ResearchLink): string {
  if (link.platform === "threads") return "Tìm bài Threads trên web";
  if (link.platform === "facebook") return "Tìm bài Facebook trên web";
  if (link.platform === "reddit") return "Tìm thảo luận Reddit";
  if (link.platform === "youtube") return "Tìm video YouTube";
  if (link.platform === "maps") return "Tra cứu Google Maps";
  return link.label;
}

function SearchLinks({ links }: { links: ResearchLink[] }) {
  return <div className="research-links">{links.map(link => <a className={`research-link research-${link.platform}`} key={link.platform} href={link.url} target="_blank" rel="noreferrer"><span><strong>{searchLabel(link)}</strong><small className="research-hint">{link.hint}</small></span><ExternalLink size={14} aria-hidden="true" /></a>)}</div>;
}

function savedDiscussion(source: Discussion): SourceReference {
  const notes = [
    `Nguồn: ${source.platform} · ${source.sourceLabel}`,
    `Bài đăng: ${dateText(source.publishedAt)} · Phạm vi: ${source.scope}`,
    `Đối chiếu nguồn: ${dateText(source.checkedAt)}`,
    "",
    `Tóm tắt ý kiến cộng đồng: ${source.summary}`,
    `Lưu ý: ${source.limitation}`,
  ].join("\n");
  return sourceFromUrl(source.title, source.url, source.place, notes);
}

export default function SourcesPanel({ trip, onAdd, onEdit, onToggle, onSaveDiscussion }: SourcesPanelProps) {
  const references = trip.references ?? [];
  const [view, setView] = useState<"saved" | "community">(references.length ? "saved" : "community");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const normalizedQuery = normalizeSearch(query);
  const visibleCommunity = communityData.filter(source => (city === "all" || source.city === city) && normalizeSearch([source.title, source.city, source.place, source.scope, source.summary, ...source.tags].join(" ")).includes(normalizedQuery));
  const visibleSaved = references.filter(source => normalizeSearch([source.title, source.place, sourcePlatform(source.url), source.notes].join(" ")).includes(normalizedQuery));
  const searchCity = view === "community" && city !== "all" ? city : "";
  const searchName = query.trim() || searchCity || trip.destination;
  const links = communityLinks(searchName, query.trim() ? searchCity : "");
  const savedUrls = new Set(references.map(source => sourceIdentity(source.url)));
  const readCount = references.filter(source => source.read).length;

  return <section className="sources-panel">
    <header className="source-intro"><div><span className="eyebrow">ĐỌC THÊM, CHỌN KỸ HƠN</span><h2>Góc nhìn trước chuyến đi</h2><p>Tìm trải nghiệm về nơi bạn định đến, giữ lại bài hữu ích và thêm ghi chú của riêng mình.</p></div><button type="button" className="button primary" onClick={onAdd}><Plus size={17} />Lưu một đường dẫn</button></header>

    <div className="source-toolbar"><label className="search-field"><Search size={18} aria-hidden="true" /><input aria-label="Tìm nguồn theo địa điểm hoặc thành phố" maxLength={300} placeholder="Tên địa điểm, thành phố hoặc chủ đề…" value={query} onChange={event => setQuery(event.target.value)} /></label>{view === "community" && <select aria-label="Lọc bài cộng đồng theo thành phố" value={city} onChange={event => setCity(event.target.value)}><option value="all">Tất cả thành phố</option>{cityOptions.map(option => <option key={option}>{option}</option>)}</select>}</div>

    <details className="research-tools source-search-tools"><summary><Search size={16} aria-hidden="true" /><span>Tìm thêm về {searchName || "điểm đến"}</span><ChevronDown size={15} aria-hidden="true" /></summary><div className="research-tools-body"><SearchLinks links={links} /><p className="research-hint">Các nút mở trang tìm kiếm bên ngoài; kết quả có thể cần đăng nhập. App không tự lấy hay chấm điểm đánh giá. Hãy xem ngày đăng và đúng chi nhánh.</p></div></details>

    <div className="source-switch" role="group" aria-label="Chọn danh sách nguồn"><button type="button" className={view === "saved" ? "active" : ""} aria-pressed={view === "saved"} onClick={() => setView("saved")}><Bookmark size={16} />Đã lưu <span>{references.length}</span></button><button type="button" className={view === "community" ? "active" : ""} aria-pressed={view === "community"} onClick={() => setView("community")}><BookOpen size={16} />Góc nhìn cộng đồng <span>{communityData.length}</span></button></div>

    {view === "saved" ? <>
      <p className="source-result-count" role="status">{visibleSaved.length} nguồn{normalizedQuery ? " khớp tìm kiếm" : " đã lưu"} · {readCount}/{references.length} đã đọc</p>
      <div className="source-grid">{visibleSaved.map(source => <article className={`source-card source-saved${source.read ? " is-read" : ""}`} key={source.id}><header className="source-meta"><span><Link2 size={13} />{sourcePlatform(source.url)}</span>{source.read && <span><CheckCircle2 size={13} />Đã đọc</span>}</header><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={14} aria-hidden="true" /></a></h3>{source.place && <p className="source-place"><MapPin size={14} />{source.place}</p>}<p className="source-date">Lưu ngày <time dateTime={source.addedOn}>{dateText(source.addedOn)}</time></p>{source.notes && <details className="source-notes"><summary>Ghi chú & thông tin nguồn<ChevronDown size={14} aria-hidden="true" /></summary><p>{source.notes}</p></details>}<footer className="source-actions"><button type="button" className={`button ${source.read ? "soft" : "secondary"}`} aria-pressed={source.read} onClick={() => onToggle(source)}><Check size={15} />{source.read ? "Đã đọc" : "Đánh dấu đã đọc"}</button><button type="button" className="text-button" aria-label={`Sửa nguồn ${source.title}`} onClick={() => onEdit(source)}><Pencil size={15} />Sửa</button></footer></article>)}</div>
      {!visibleSaved.length && <div className="source-empty empty-state"><Bookmark size={30} /><h3>{references.length ? "Chưa có nguồn khớp tìm kiếm" : "Giữ những bài bạn muốn đọc lại"}</h3><p>{references.length ? "Thử từ khóa khác hoặc xóa tìm kiếm." : "Dán link Maps, Threads, Reddit, video hoặc website; cũng có thể lưu một bài từ mục Góc nhìn cộng đồng."}</p><button type="button" className="button secondary" onClick={references.length ? () => setQuery("") : onAdd}>{references.length ? "Xóa tìm kiếm" : "Lưu đường dẫn đầu tiên"}</button></div>}
    </> : <>
      <p className="source-result-count" role="status">{visibleCommunity.length} bài phù hợp · Ý kiến cá nhân, không phải bảng xếp hạng</p>
      <div className="source-grid">{visibleCommunity.map(source => {
        const isSaved = savedUrls.has(sourceIdentity(source.url));
        return <article className="source-card source-community" key={source.id}><header className="source-meta"><span>{source.platform} · {source.sourceLabel}</span><span className="source-scope">{source.scope}</span></header><h3>{source.title}</h3><p className="source-place"><MapPin size={14} />{source.place} · {source.city}</p><p className="source-date">Đăng <time dateTime={source.publishedAt}>{dateText(source.publishedAt)}</time> · Đối chiếu {dateText(source.checkedAt)}</p><div className="source-tags">{source.tags.map(tag => <span key={tag}>{tag}</span>)}</div><p className="source-summary">{source.summary}</p><p className="source-limitation">{source.limitation}</p><footer className="source-actions"><a className="text-button" href={source.url} target="_blank" rel="noreferrer">Đọc bài gốc<ExternalLink size={14} aria-hidden="true" /></a><button type="button" className={`button ${isSaved ? "secondary" : "soft"}`} disabled={isSaved} onClick={() => onSaveDiscussion(savedDiscussion(source))}>{isSaved ? <Check size={15} /> : <Bookmark size={15} />}{isSaved ? "Đã lưu nguồn" : "Lưu để đọc"}</button></footer></article>;
      })}</div>
      {!visibleCommunity.length && <div className="source-empty empty-state"><Search size={30} /><h3>Chưa có bài tuyển chọn khớp tìm kiếm</h3><p>Mở phần tìm thêm ở trên để tìm bài về địa điểm này, hoặc bỏ bớt bộ lọc.</p><button type="button" className="button secondary" onClick={() => { setQuery(""); setCity("all"); }}>Xóa bộ lọc</button></div>}
    </>}
  </section>;
}

export function PlaceResearchTools({ name, address = "", city = "" }: { name: string; address?: string; city?: string }) {
  const [mode, setMode] = useState<TravelMode>("driving");
  if (!name.trim() && !address.trim()) return null;
  const place = name.trim() || address.trim();
  const links = communityLinks(place, city).filter(link => link.platform !== "maps");
  return <details className="research-tools place-research-tools"><summary><Compass size={16} aria-hidden="true" /><span>Tìm hiểu & chỉ đường</span><ChevronDown size={15} aria-hidden="true" /></summary><div className="research-tools-body"><div className="research-directions"><a className="button secondary" href={mapsUrl(name, address)} target="_blank" rel="noreferrer"><MapPin size={15} />Tra cứu Maps<ExternalLink size={13} aria-hidden="true" /></a><label className="research-mode"><span>Phương tiện</span><select aria-label={`Phương tiện đến ${place}`} value={mode} onChange={event => setMode(event.target.value as TravelMode)}>{travelModes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><a className="button soft" href={directionsTo(name, address, mode)} target="_blank" rel="noreferrer"><Navigation size={15} />Chỉ đường đến đây<ExternalLink size={13} aria-hidden="true" /></a></div><p className="research-hint">Google Maps sẽ dùng vị trí khả dụng hoặc hỏi điểm xuất phát. Kiểm tra đúng địa điểm trước khi đi.</p><SearchLinks links={links} /><p className="research-hint">Đây là đường dẫn tìm kiếm, chưa phải các bài đánh giá đã được đọc. Threads và Facebook chỉ tìm bài công khai được lập chỉ mục.</p></div></details>;
}
