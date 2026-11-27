# Make Tour Plan · Lên đường

Ứng dụng tiếng Việt để lên kế hoạch chuyến đi theo từng ngày, từng giờ. Giao diện responsive, dữ liệu riêng theo tài khoản ChatGPT, tự động lưu vào Cloudflare D1 và giữ bản nháp riêng cho từng tab.

**Bản 1.0.0 · rà soát ngày 27/11/2026.**

App đang chạy tại [Lên đường](https://len-duong-hanh-trinh.workspace-qu-1719.chatgpt.site/). Đây là không gian riêng theo quyền truy cập hiện có. Kho mã nguồn chứa ứng dụng, danh mục gợi ý, tài liệu và kiểm thử; không chứa dữ liệu chuyến đi thật, cookie, token hay cơ sở dữ liệu người dùng.

## Hoàn thiện trong bản cuối

- Thêm **Nguồn tham khảo**: lưu đường dẫn bài viết/video, ghi chú, chủ đề/địa điểm và trạng thái đã đọc. Có 6 thảo luận Reddit được tuyển chọn, kèm ngày đăng, ngày đối chiếu và phạm vi nhận xét. Lưu trùng bài Reddit được nhận diện cả khi khác slug hoặc query chia sẻ.
- Từng hoạt động, địa điểm và gợi ý có **Tìm hiểu & chỉ đường**: Google Maps, Reddit, Threads, Facebook, YouTube và tìm kiếm web. Threads/Facebook mở tìm kiếm bài công khai được lập chỉ mục; không giả lập API hay điểm đánh giá.
- Google Maps có 5 phương tiện: ô tô/taxi, xe máy, đi bộ, xe đạp, công cộng. Transit tách từng cặp điểm; các chế độ khác chia tối đa 5 điểm/chặng. Có chỉ đường tới một nơi từ vị trí khả dụng trên Maps.
- Sửa biểu mẫu mở lâu ghi đè thay đổi mới: chỉ hợp nhất thông tin chuyến đã sửa; các mục bị sửa/xóa từ phiên khác được báo xung đột. Hoàn tác hết hiệu lực khi dữ liệu nền đổi. Sao chép ngày và mọi biểu mẫu gắn đúng chuyến ban đầu.
- Gắn API với danh tính đang mở app; bảo vệ khi cookie tài khoản thay đổi. Có nút bỏ một bản nháp phục hồi, kiểm tra đúng phiên bản trước khi xóa.
- Ghi chú dùng cửa sổ chỉnh sửa giữ nội dung khi lưu thất bại. HTML ngoại tuyến mang theo nguồn tham khảo và địa điểm đã lưu; JSON cũ vẫn nhập được.
- Bộ lọc Khám phá tự chọn thành phố khi nhận diện được điểm đến; lịch mẫu hiển thị lý do nếu ngày/giờ nhập không hợp lệ.

## Các tính năng đã có

- Khám phá 32 địa điểm: 22 TP.HCM, 4 Vũng Tàu, 3 Đà Lạt, 2 Đà Nẵng, 1 Hội An. Có bộ lọc thành phố, sở thích, khoản dự trù, trong nhà, tìm kiếm không dấu, lưu địa điểm và thêm vào lịch. Bốn lịch đi chơi biên tập cho phép xem trước rồi thêm hoạt động.
- Chia đều thực chi đã gán người trả, gợi ý thanh toán lại chính xác tới đồng; khoản thiếu người trả được hiển thị riêng. Nhập tên thành viên trong chi tiết chuyến đi.
- Ghi tiền hoàn ở đặt chỗ; hủy vẫn giữ khoản đã trả chưa được hoàn. Dự kiến theo số người hiện tại, thực chi theo số người lúc ghi nhận.
- Sao chép một ngày; tùy chọn dời toàn bộ hoạt động, đặt chỗ và ghi chú theo ngày khởi hành mới. Nhân bản dùng draft đang chỉnh và xóa thực chi, trạng thái hoàn thành, liên kết đặt chỗ khỏi bản sao.
- Tạo hoạt động liên kết trực tiếp từ đặt chỗ; tuyến Maps chia đủ điểm thành nhiều chặng; bảng việc cần kiểm tra và chế độ đang đi theo múi giờ.
- Xuất HTML chỉ đọc để xem ngoại tuyến, lịch văn bản rút gọn để tự chia sẻ, ngoài JSON/ICS/PDF đã có. Bản HTML không tự đồng bộ và không chứa bản đồ; liên kết Maps/website vẫn cần mạng. Bản này có thể chứa mã đặt chỗ, chi phí và ghi chú riêng. Văn bản rút gọn bỏ các thông tin đó.
- Sửa lưu nhiều tab, khôi phục sau lỗi mạng, trạng thái bộ nhớ bị từ chối, tìm kiếm chữ Đ, định danh sự kiện ICS và giới hạn dung lượng UTF-8.

## Tính năng

- Nhiều chuyến đi: tạo, sửa, nhân bản, xóa có hoàn tác; ngày đi/về, số người, hạn mức, múi giờ.
- Lịch trình: thêm/sửa/xóa/nhân bản, chuyển ngày, thời gian linh hoạt hoặc qua đêm, loại hoạt động, địa chỉ, dự kiến di chuyển, ưu tiên, ghi chú, phương án dự phòng, liên kết đặt chỗ.
- Cảnh báo trùng giờ và không đủ thời gian di chuyển. Đổi khoảng ngày không xóa hoạt động hay ghi chú ngoài khoảng mới.
- Ngân sách: dự kiến/thực chi, số tiền cả nhóm hoặc mỗi người, danh mục, người trả, đặt chỗ và tiền cọc. Hoạt động liên kết đặt chỗ không cộng trùng chi phí.
- Địa điểm: danh sách muốn ghé/đã ghé, thêm vào lịch, mở tìm kiếm/đường đi Google Maps. Địa chỉ do người dùng nhập; không tích hợp Places API.
- Đặt chỗ: đơn vị, mã xác nhận, ngày/giờ, liên hệ, URL, tổng tiền, đã trả, trạng thái, ghi chú. Chỉ lưu thông tin người dùng tự đặt.
- Hành lý/việc cần làm: thêm/sửa/xóa, phân nhóm, người phụ trách, đánh dấu xong, ẩn mục đã xong, checklist cơ bản.
- Ghi chú lưu qua cửa sổ chỉnh sửa có bảo vệ xung đột. Sao lưu/nhập JSON có kiểm tra dữ liệu; lựa chọn thêm mới hoặc thay thế; xuất ICS và in/lưu PDF từ trình duyệt.

## Dữ liệu & đồng bộ

`travel_states` lưu một tài liệu JSON cho từng người dùng đã xác thực. GET/PUT `/api/trips` yêu cầu danh tính ChatGPT hợp lệ và header `X-Expected-User-Id` trùng danh tính đó. Sai danh tính trả `403 identity_changed` trước khi chạm dữ liệu. Header này là kiểm tra nhất quán, không thay thế xác thực máy chủ. Mỗi lần lưu dùng revision để tránh ghi đè giữa thiết bị; SQL cập nhật có điều kiện là nguyên tử. Bản nháp xung đột luôn giữ revision gốc. Không tự hợp nhất các xung đột: xuất JSON, tải lại bản máy chủ, rồi nhập bản nháp như một chuyến mới nếu cần.

Bản nháp theo từng trang dùng khóa riêng, tách khỏi bộ đệm sạch chỉ cập nhật sau khi máy chủ xác nhận. Tab khác lưu thành công không được xóa bản đang sửa. Tải lại chỉ bỏ bản hiện tại sau khi có phản hồi hợp lệ. Khi bộ nhớ trình duyệt bị từ chối, app báo rõ và cho phép tải JSON. Bản nháp từ phiên khác có thể xem thông tin và tải xuống để phục hồi, hoặc chủ động bỏ đúng bản đang hiển thị. Một bản bị thay đổi trong lúc cửa sổ xác nhận mở sẽ không bị xóa. Hàm thay đổi tại client cũng kiểm tra snapshot hiện tại trước khi ghi. Chưa có đồng biên tập thời gian thực hoặc tự hợp nhất thay đổi giữa người dùng.

Nếu không có danh tính (bản xem thử), chỉ lưu trong trình duyệt và hiển thị rõ trạng thái. Khi dữ liệu máy chủ chưa đọc được, không tạo bản ghi mới đè lên dữ liệu cũ. Khi tài khoản chưa có chuyến nào, một lịch mẫu Đà Lạt 3 ngày được thêm. Giá, thời gian, dịch vụ và đặt chỗ trong mẫu đều chỉ minh họa.

Tiền tệ: VND. Chi phí thực tế `null` nghĩa là chưa ghi, số `0` nghĩa là miễn phí. Dự kiến theo người nhân số người hiện tại; thực chi theo người nhân `actualPeople` đã chốt. Bản cũ thiếu trường này được chốt trước khi đổi số người. Đặt chỗ có thực chi ròng = tiền đã trả − tiền đã hoàn; hủy không xóa tiền chưa được hoàn và không còn khoản phải trả. Hoạt động liên kết đặt chỗ tồn tại không cộng chi phí riêng, kể cả khi đặt chỗ hủy. Xóa đặt chỗ sẽ bỏ liên kết; hoàn tác có thể phục hồi thay đổi.

Chia tiền chỉ dùng khoản thực chi đã gán đúng thành viên hiện tại. Đổi thứ tự tên giữ danh tính người trả; tên mới thay tên cũ ở cùng dòng là đổi tên; người bị loại khỏi nhóm giữ tên trên khoản chi và được báo chưa phân bổ. App không chuyển tiền và chưa có sổ ghi nhận khoản hoàn trả giữa thành viên.

`travelMinutes` là thời gian đến hoạt động từ điểm trước, do người dùng ước tính. Lịch gợi ý khởi tạo khoảng di chuyển 25 phút để điều chỉnh, không phải kết quả định tuyến thực tế. Chế độ đang đi dùng giờ đã nhập, không dùng GPS và không tự đánh dấu đã đến.

Giới hạn dữ liệu: 30 chuyến, tối đa 90 ngày trong khoảng chính của mỗi chuyến; 600 hoạt động, 400 khoản chi riêng, 100 đặt chỗ, 300 địa điểm, 300 nguồn tham khảo, 500 mục checklist/chuyến. Dữ liệu compact UTF-8 tối đa 1.800.000 byte, chừa khoảng an toàn cho hàng D1 tối đa 2.000.000 byte theo https://developers.cloudflare.com/d1/platform/limits/. Tệp nhập/request tối đa 4.000.000 byte nhưng nội dung sau kiểm tra vẫn phải trong giới hạn lưu. Các trường mới đều tùy chọn, giữ tương thích sao lưu version 1.

Google Maps mở tối đa 5 điểm mỗi chặng (bao gồm 3 điểm trung gian); riêng công cộng mở từng cặp điểm và nối tiếp đủ điểm của tuyến. URL quá dài được xử lý bằng tìm kiếm riêng có giải thích; không âm thầm bỏ điểm cuối. App chưa tự tối ưu tuyến hoặc tải bản đồ ngoại tuyến.

## Gợi ý địa điểm và đối chiếu sản phẩm

Danh mục được đối chiếu tên, địa chỉ, loại hoạt động từ website đơn vị vận hành hoặc cơ quan du lịch ngày 27/11/2026. Mỗi bản ghi tại `lib/suggestions-data.json` có nguồn và ngày kiểm tra, hiển thị ngay trong app. Ngân sách, thời lượng, độ phù hợp và thời điểm gợi ý là biên tập để lập kế hoạch; không phải giá niêm yết, giờ mở cửa trực tiếp, đánh giá Google hoặc bảng xếp hạng Gen Z.

Đối chiếu chức năng từ nguồn chính thức:

- Wanderlog: khám phá, ngân sách/chia chi phí, checklist, tuyến, ngoại tuyến, cộng tác — https://wanderlog.com/
- TripIt: gom đặt chỗ và lịch, đồng bộ lịch; cảnh báo chuyến bay nâng cao — https://help.tripit.com/en/support/solutions/articles/103000063396-tripit-or-tripit-pro-
- Tripomatic: kế hoạch theo ngày, tuyến theo phương tiện, cộng tác, xuất file, bản đồ ngoại tuyến — https://tripomatic.com/en
- Roadtrippers: điểm dừng dọc tuyến, lịch theo ngày, dự trù nhiên liệu, nhận xét cộng đồng — https://roadtrippers.com/about/features/

Bản này có khám phá có nguồn, sổ tay nguồn/ý kiến cộng đồng, chia tiền, quản lý ngày, liên kết đặt chỗ, tuyến theo phương tiện và HTML ngoại tuyến. Chưa tích hợp email tự nhập đặt chỗ, thông báo chuyến bay/thời tiết trực tiếp, Places API, cộng tác thời gian thực hay tối ưu tuyến tự động. Chưa có bản đồ tương tác nhúng, GPX/KML, đồng bộ lịch hai chiều hoặc tự tính nhiên liệu từ tuyến. Những tính năng đó cần thiết kế và dịch vụ dữ liệu riêng; liên kết tìm kiếm hiện tại không được trình bày như tích hợp đầy đủ của các app trên.

### Hợp đồng liên kết

- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started): `api=1`, mã hóa tham số, tối đa 2.048 ký tự, không cần API key. [Transit không hỗ trợ nhiều đích](https://support.google.com/maps/answer/144339?co=GENIE.Platform%3DDesktop&hl=en-en).
- [Reddit Search](https://support.reddithelp.com/hc/en-us/articles/19696541895316-Available-search-features): dùng truy vấn `q`, không giả định nội dung tìm thấy đã được app đọc.
- [Threads trên web](https://about.fb.com/news/2025/04/new-features-threads-web-experience/): dùng tên miền threads.com. Nút trong app mở Google `site:threads.com`; phạm vi chỉ gồm bài được lập chỉ mục.

Nguồn Reddit tại `lib/community-data.json` là ý kiến cá nhân, không phải thông tin địa điểm xác nhận, không quy đổi thành sao. Ngày đăng khác ngày kiểm tra; không lấy giá/thời tiết/tình trạng sân bay được kể trong bình luận làm dữ liệu hiện tại. Mọi thẻ đều dẫn về bài gốc.

## Phát triển

Dùng starter Sites Vinext với React 19, TypeScript, Zod, Drizzle và Cloudflare D1. Các ảnh và phông chữ được phục vụ từ ứng dụng, không cần CDN khi mở trang.

```sh
npm run install:ci
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Trong môi trường Sites được quản lý, dùng `sites-preview start <checkout>` theo kỹ năng Sites. Môi trường khác dùng `npm run dev`. Migration tại `drizzle/`; migration đã áp dụng là bất biến. Cấu hình triển khai nằm trong `.openai/hosting.json`. Không đưa khóa bí mật vào trình duyệt hoặc kho nguồn.

## Kiểm tra

`npm test` chạy **6 suite, 91 tình huống/nhóm kiểm tra**, tất cả đã qua trong lần rà cuối:

| Nhóm | Số kiểm tra | Nội dung chính |
|---|---:|---|
| Model | 18 | Tiền, hoàn tiền, chia nhóm, ngày/qua đêm, sao chép, ICS, Maps và giới hạn byte |
| Persistence | 21 | Nhiều tab, CAS phía client, mất mạng/phản hồi, khôi phục, storage lỗi, đổi tài khoản, bỏ đúng bản nháp |
| Discovery | 5 | 32 địa điểm, schema, nguồn, bộ lịch gợi ý qua nửa đêm/năm mới |
| UI helpers | 13 | Hợp nhất biểu mẫu, xung đột metadata, đổi thành viên/ngày, nhân bản, xuất ngoại tuyến/chia sẻ |
| API | 26 | Xác thực, danh tính kỳ vọng, cách ly người dùng, CAS cạnh tranh, request sai và giới hạn UTF-8 |
| Research/editor | 8 | Liên kết xã hội, Maps mode, nhận diện URL, schema nguồn, chống HTML injection, hoàn tác và stale editor |

Kiểm tra TypeScript đầy đủ cũng đã qua. API tests dùng handler/auth/Drizzle thật với adapter D1 trên SQLite cục bộ; không ghi dữ liệu production.

Đã thao tác bản xem thử trong trình duyệt: tạo chuyến và thành viên; lọc/lưu địa điểm, thêm hoạt động; thực chi theo người, chia tiền, hủy/hoàn đặt chỗ; tìm nguồn không dấu, lưu/sửa/đánh dấu đã đọc, tải trang kiểm tra dữ liệu còn; lưu ghi chú, sao chép ngày và Hoàn tác; chọn tuyến công cộng 9 điểm thành 8 chặng, chỉ đường xe máy, bộ lọc mặc định Đà Lạt. Đã quan sát giao diện Nguồn tham khảo và không thấy lỗi ứng dụng trong console của preview.

Giới hạn kiểm chứng: chưa kiểm tra trên thiết bị di động thật, tài khoản production trong trình duyệt hoặc mọi kết quả sau khi mở app Google Maps. Cơ chế đồng bộ được kiểm tra bằng integration/regression; liên kết ngoài cần mạng và khả dụng tùy dịch vụ/khu vực. Build/deploy được thực hiện bằng quy trình Sites sau các kiểm tra trên.

## Tài nguyên

- Ảnh Đà Lạt: Dongdilac / Pexels — https://www.pexels.com/photo/misty-morning-landscape-in-da-l-t-vietnam-30317696/ — https://www.pexels.com/license/
- Be Vietnam Pro: Google Fonts, SIL OFL 1.1; bản giấy phép đầy đủ tại `public/fonts/OFL-BeVietnamPro.txt`.
- Biểu tượng: Lucide.
