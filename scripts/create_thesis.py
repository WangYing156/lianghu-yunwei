from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from pathlib import Path

OUT=Path('docs/论文/两湖隧道智能运维管理平台设计与实现.docx'); OUT.parent.mkdir(parents=True,exist_ok=True)
d=Document(); sec=d.sections[0]; sec.top_margin=Inches(.75); sec.bottom_margin=Inches(.75); sec.left_margin=Inches(.85); sec.right_margin=Inches(.85)
style=d.styles['Normal']; style.font.name='宋体'; style._element.rPr.rFonts.set(qn('w:eastAsia'),'宋体'); style.font.size=Pt(10.5)
for nm in ['Title','Heading 1','Heading 2','Heading 3']:
 s=d.styles[nm]; s.font.name='黑体'; s._element.rPr.rFonts.set(qn('w:eastAsia'),'黑体')
 s.font.color.rgb=RGBColor(27,57,88)

def shade(cell,color):
 tcPr=cell._tc.get_or_add_tcPr(); sh=OxmlElement('w:shd'); sh.set(qn('w:fill'),color); tcPr.append(sh)
def para(text='',bold=False,center=False):
 p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.JUSTIFY
 r=p.add_run(text); r.bold=bold; return p
def heading(t,l=1): d.add_heading(t,level=l)
def table(headers,rows,widths=None):
 t=d.add_table(rows=1, cols=len(headers)); t.style='Table Grid'; t.alignment=WD_TABLE_ALIGNMENT.CENTER
 for i,h in enumerate(headers):
  c=t.rows[0].cells[i]; c.text=h; shade(c,'173A5E')
  for r in c.paragraphs[0].runs: r.font.color.rgb=RGBColor(255,255,255); r.bold=True
 for row in rows:
  cells=t.add_row().cells
  for i,v in enumerate(row): cells[i].text=str(v); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
 return t
def figcaption(t): para(t,center=True).runs[0].italic=True

def diagram(title, rows, caption):
 heading(title,2); t=table(['层次/组成','职责与实现'],rows); figcaption(caption)

# cover
p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before=Pt(70); r=p.add_run('两湖隧道（南湖段）智能运维管理平台\n设计与实现'); r.bold=True; r.font.name='黑体'; r._element.rPr.rFonts.set(qn('w:eastAsia'),'黑体'); r.font.size=Pt(25); r.font.color.rgb=RGBColor(23,58,94)
para('——基于 BIM 与 Cesium 的隧道三维可视化运维原型研究',center=True)
for _ in range(4): d.add_paragraph('')
for text in ['项目论文（依据代码仓库实现情况编写）','研究对象：两湖隧道（南湖段）智能运维管理平台','版本：2026年11月','说明：本论文描述的是可运行前端原型，不代表已接入生产物联网或实时业务系统。']:
 para(text,center=True)
d.add_page_break()
heading('摘要',1)
para('针对隧道运维信息分散、空间位置与设备资料关联不直观、三维模型难以参与日常检视等问题，本文以两湖隧道（南湖段）智能运维管理平台为对象，设计并实现一套以浏览器为载体的三维运维可视化原型。系统采用 Vue 3 与 TypeScript 构建业务界面，以 Cesium 承载 BIM 场景，通过共享场景组织总览、智能交通、智慧养护、智慧监测、数字应急、数字服务及资产资料等模块。实现重点包括施工与局部竣工模型协同展示、模型构件的空间定位与筛选、屏幕空间聚合、跨模型坐标系剖切、基于实际道路几何采样的内部巡游，以及告警与设备的场景定位。')
para('工程实现采用“空间对象—业务视图—交互命令”分层组织：配置层提供设备与演示事件目录，场景组合层管理相机、图层、模型和拾取，业务层负责面板及模块展示。项目测试覆盖路径计算、图层行为、材质和剖切等逻辑，并提供浏览器交互回归脚本。需要强调的是，仓库当前包含真实 BIM 几何与部分构件属性，但工单、告警、交通统计、视频画面等仍为固定演示数据，尚无实时 IoT、账号权限或真实视频服务。本文结论因此限定于前端原型的交互与工程可行性，不将其外推为生产系统效果。')
para('关键词：隧道运维；建筑信息模型；三维可视化；Cesium；设备定位；前端原型',bold=True)
heading('Abstract',1)
para('This paper presents a browser-based 3D operation and maintenance prototype for the Nanhu section of the Lianghu Tunnel. Vue 3 and TypeScript implement the application interface, while Cesium hosts BIM scenes. The prototype integrates seven operational views around a shared 3D context and implements model inspection, equipment picking, screen-space marker clustering, cross-model sectioning, route-based interior roaming, and event-to-location navigation. The route is sampled from roadway geometry in the supplied as-built model rather than a schematic centerline. Automated tests cover key path, layer, material, and sectioning behavior. The current repository is a front-end prototype: selected BIM geometry and component metadata are available, whereas alerts, work orders, traffic metrics, and video imagery are demonstration content; no live IoT or production video backend is connected. The findings are consequently limited to implementation and interaction feasibility.')
para('Keywords: tunnel operation; BIM; 3D visualization; Cesium; equipment localization; web prototype',bold=True)
heading('目录',1)
for x in ['1 绪论','2 需求与总体设计','3 系统关键技术与实现','4 交互设计与关键算法','5 测试与结果分析','6 讨论、限制与后续工作','7 结论','参考文献'] : para(x)
d.add_page_break()
heading('1 绪论')
heading('1.1 研究背景',2)
para('隧道运维对象具有显著的空间属性：设备分布在不同区段和结构层次，单靠表格或平面符号难以表达构件之间的空间关系。BIM以结构化模型承载构件几何及属性，三维地理可视化则提供视角、定位与场景交互能力。将二者用于运维信息的浏览和检视，可以形成面向人员的空间入口；但能否形成完整业务闭环，还依赖数据治理、接口服务和现场流程，不能仅由三维界面推断。')
# 项目随附场景底图图像：作为项目资源示例展示，不声称其为论文原创摄影
p=d.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run().add_picture('public/scene-map.jpg', width=Inches(6.2))
figcaption('图1 项目仓库随附的隧道区域场景底图示例（来源：项目资源 public/scene-map.jpg；底图数据授权信息应以资源原始提供方为准）')
heading('1.2 研究目标与范围',2)
para('本项目目标是实现可浏览、可检索、可定位、可剖切的隧道三维运维前端，并用多个业务视图验证共享场景的组织方式。研究范围限定为仓库中的前端代码、随附模型及自动化检查：不涉及现场传感器接入、告警算法精度、生产级权限与审计，也不对运营安全或经济效益作定量结论。')
heading('1.3 研究内容与方法',2)
para('采用需求梳理、模块化设计、原型实现和自动化验证相结合的方法。首先从项目说明及代码梳理功能边界；随后设计场景、数据、交互的职责划分；最后通过单元测试和浏览器场景测试核查可复现的交互行为。论文陈述以仓库实现为依据，未在项目中实现的能力明确列入限制。')
heading('2 需求与总体设计')
heading('2.1 需求分析',2)
table(['需求类别','项目中的具体体现','设计约束'],[
('空间检视','施工模型与局部竣工模型在统一场景展示','模型变换不可假设同一局部原点'),('设备查找','按名称或编号定位真实可独立定位构件','不得为合并导出的构件虚构坐标'),('场景交互','图层、聚合、剖切、二维/三维、内部巡游','状态切换需可恢复，资源需清理'),('业务关联','告警、监控、模块页面联动场景','演示事件必须标明模拟属性'),('可访问性','键盘操作、减少动态效果偏好','不把自动动画作为唯一交互方式')])
heading('2.2 系统架构',2)
diagram('图1 系统逻辑分层',[
('表现层','Vue 3 页面、业务卡片、设备/告警面板、巡游控制组件'),('场景协调层','Cesium 场景生命周期、相机、模型图层、拾取与导航请求'),('领域功能层','构件目录、点位聚合、剖切、巡游路径、材质策略、告警轮播'),('数据与资源层','BIM Tileset/GLB、设备配置、演示事件、静态图像及环境配置')], '图1 以共享三维场景作为跨模块空间上下文；各层通过明确的数据和交互职责协作。')
para('架构上，Vue 负责页面状态和组件组合，Cesium 负责三维内容呈现与空间操作；配置文件集中保存图层点位、模拟告警及路线等前端数据。该组织降低模块之间重复创建场景的成本，也要求页面切换时显式处理默认图层、相机和临时效果。不同业务页面共享空间对象，但业务统计与设备模型数据并不因此具有相同的真实性。')
heading('2.3 功能模块',2)
table(['模块','主要作用','场景联动'],[('总览','告警、交通、监控及设备概况','告警与监控定位'),('智能交通','交通状态、视频示例与诱导信息展示','交通图层'),('智慧养护','病害、工单和维护信息展示','结构监测与病害点'),('智慧监测','环境及结构监测信息展示','环境/结构点位'),('数字应急','应急情景与处置要素展示','应急设施与巡游联动'),('数字服务','公众反馈与服务信息展示','事件点位'),('资产资料中心','资产树、模型与资料面板','列表及构件定位')])
heading('3 系统关键技术与实现')
heading('3.1 BIM 场景组织与坐标变换',2)
para('平台使用 Cesium 加载三维模型资源，以场景相机和模型变换实现空间呈现。施工模型与竣工模型可能采用不同的局部坐标系，因此剖切不能把同一数值直接当作各自局部坐标。实现中将剖切平面作为统一世界空间语义，再根据目标 Tileset 的变换换算到各模型坐标系；剖切范围由模型包围范围确定。该策略避免模型原点差异导致切割位置不一致。')
heading('3.2 设备目录、定位与聚合',2)
para('系统从竣工模型目录解析可独立定位的构件，项目说明记录当前目录中有138个此类构件。图标位置依据构件包围球及模型变换获得，而非简单按桩号平均插值。远景图标按屏幕像素距离进行聚合，以控制密集点位遮挡；聚合项可展开成员并进一步定位。告警和当前选中设备采用优先显示层，避免普通聚合掩盖重要状态。近景则隐藏外部图标、回到一定距离后再显示，借助不同进入/退出阈值降低临界抖动。')
heading('3.3 基于模型几何的内部巡游',2)
para('内部巡游路径由竣工 GLB 中道路构件的上表面采样得到，每个通行层各包含一组采样点；运行时经 Tileset 根变换映射到世界坐标，并叠加观察高度。播放依据路径弧长和时间推进，而非以固定索引匀速跨越不同长度线段。更换模型或道路构件后必须重新校准并人工复核净空，不能将既有路线假定为普适数据。巡游期间隐藏外部点位标记，检视真实模型几何，并支持暂停、反向、速度切换及设备检索。')
heading('3.4 业务事件与数据真实性边界',2)
para('告警轮播、统计卡片、视频窗口与场景定位采用前端配置的演示数据。系统将模拟事件统一关联到稳定点位标识，以保证横幅、告警面板和地图标记使用一致对象；视觉上明确标记模拟事件与示例画面。项目当前没有实时告警接口或实时视频流，业务状态刷新也不代表后台数据更新。此区分是原型解释和后续接口集成的必要前提。')
diagram('图2 典型空间交互链路',[
('用户输入','点击告警 / 设备 / 聚合成员，或提交设备名称检索'),('对象解析','通过稳定 pointId 或 BIM 构件目录识别目标'),('状态协调','检查图层可见性、视图模式和巡游状态，必要时启用目标图层'),('空间反馈','相机定位、构件高亮、详情打开或聚合成员展示')], '图2 交互链路强调“对象身份—场景状态—空间反馈”闭合，而非单纯视觉动画。')
heading('4 交互设计与关键算法')
heading('4.1 剖切状态管理',2)
para('剖切工具包含 X、Y 和水平 Z 方向、位置调节、反向保留及目标模型选择。二维视图和内部巡游期间暂停剖切；返回外部三维时恢复先前状态；场景销毁时释放剖切相关资源。路面保留原始 GLB 材质，只有用户显式启用透视时才改变道路透明度，避免施工模型透明策略意外污染竣工道路材质。')
heading('4.2 自适应交互与减动效',2)
para('远景图标聚合以像素尺度而非固定地理距离为依据，使不同缩放级别下的重叠行为更贴近屏幕呈现。场景高度调整支持鼠标、触屏及键盘操作。告警自动轮播可由悬停、键盘聚焦暂停，页面转入后台时停止计时；检测到减少动态效果偏好时关闭自动轮播与呼吸动画，仍保留手动检视。')
heading('4.3 关键数据结构与测试策略',2)
table(['对象','核心字段/关系','核查重点'],[('构件目录项','构件名称、模型标识、变换后位置','能否独立定位；模型更新后是否需重新生成'),('场景点位','稳定 pointId、分类、坐标与图层','显隐不改变位置；告警关联一致'),('巡游路线','按层采样的三维点序列','弧长推进、坐标转换、方向与范围'),('模拟告警','事件等级、来源、点位ID、说明','各视图共享，清楚标识模拟')])
heading('5 测试与结果分析')
heading('5.1 验证环境与方式',2)
para('仓库提供 npm test、npm run typecheck、npm run build 及 npm run test:scene 等命令。单元测试覆盖巡游路径、场景交互、点位配置与材质/特效等逻辑；浏览器脚本面向开发服务验证场景操作。README记载了28项测试，浏览器交互回归覆盖29项检查；两者统计口径和执行条件不同，浏览器检查需本机 Chromium 与开发服务。本文不虚构本次运行的通过率或性能指标，复现实验时应在目标环境记录命令输出、浏览器与显卡信息。')
heading('5.2 结果与分析',2)
para('从源码及测试设计可确认的实现结果包括：共享场景服务多个业务视图；设备图标具备独立目录与聚合成员检视；剖切考虑不同模型局部坐标；巡游路径从道路几何采样；告警定位处理目标图层关闭情形；场景模式切换会恢复临时状态。上述结论是功能实现层面的观察，不等同于现场运维效率提升。实际效果仍需在真实模型完整度、设备台账一致性、操作任务成功率及运行硬件条件下开展用户验证。')
heading('6 讨论、限制与后续工作')
heading('6.1 当前限制',2)
para('第一，当前交付以浏览器前端原型为主，没有生产后台、用户认证、权限控制及操作审计。第二，告警、工单、交通统计、监测数值和视频图片属于固定或示例数据。第三，竣工 BIM 是局部范围，合并导出的构件不具备独立设备坐标时不会伪造设备条目。第四，倾斜摄影资源未随仓库完整提供，在线底图依赖有效服务配置。第五，本文没有现场性能基准和真实用户研究数据。')
heading('6.2 后续工作',2)
para('后续可在数据治理完成后接入经授权的设备台账、告警与视频服务；明确各系统数据时间戳、设备唯一标识和空间坐标基准；建立模型版本与设备目录的自动校验流程；针对典型任务开展可用性测试并测量任务耗时、定位成功率和错误恢复情况。生产部署还需补充鉴权、传输安全、审计、故障降级和服务监控。每项扩展均应以真实接口及验收证据为依据，避免仅通过演示界面宣称业务闭环。')
heading('7 结论')
para('本文围绕两湖隧道（南湖段）智能运维管理平台，梳理并说明了其前端原型的需求、架构与关键实现。项目利用 Cesium 与 BIM 模型建立空间浏览入口，通过设备目录、屏幕空间聚合、跨坐标系剖切及模型道路采样巡游，支持若干具有代表性的三维检视任务；同时以模拟数据驱动业务页面，并明确真实模型数据与演示业务信息的边界。项目测试设计为关键交互提供了可重复核查路径。现阶段成果证明的是前端交互组织与三维检视的工程可行性，不足以证明生产运维成效；实时数据、业务闭环和现场验证仍是后续工作的重点。')
heading('参考文献')
refs=[
'[1] Cesium. CesiumJS Documentation[EB/OL]. https://cesium.com/learn/cesiumjs/ref-doc/（访问日期：2026-11-12）.',
'[2] Open Geospatial Consortium. OGC 3D Tiles Specification, Version 1.1[EB/OL]. https://docs.ogc.org/cs/22-025r4/22-025r4.html（访问日期：2026-11-12）.',
'[3] Vue.js. Vue.js Guide[EB/OL]. https://vuejs.org/guide/introduction.html（访问日期：2026-11-12）.',
'[4] ISO. ISO 19650-1:2018 Organization and digitization of information about buildings and civil engineering works, including building information modelling—Information management using building information modelling—Part 1: Concepts and principles[S]. Geneva: International Organization for Standardization, 2018. https://www.iso.org/standard/68078.html.',
'[5] World Wide Web Consortium. Web Content Accessibility Guidelines (WCAG) 2.2[EB/OL]. https://www.w3.org/TR/WCAG22/（访问日期：2026-11-12）.',
'[6] Wang Ying. lianghu-yunwei: 两湖隧道（南湖段）智能运维管理平台[CP/OL]. GitHub repository, README及源码，2026. https://github.com/WangYing156/lianghu-yunwei（访问日期：2026-11-12）.'
]
for x in refs: para(x)
heading('写作与引用说明',1)
para('本文依据当前代码仓库及项目文档独立归纳撰写，外部资料只用于说明所采用技术与信息管理/可访问性背景；项目功能和测试事实以仓库为准。文中未复制外部论文段落，也未使用虚构文献。查重率由具体检测系统、比对库和学校规则决定，无法通过写作承诺某一数值；提交前应按所在机构格式规范核对引文、图表来源和原创性要求。图1、图2为依据本项目结构原创整理的示意图；若补入真实运行截图，应标注采集日期、页面及数据性质。')
# header/footer
for s in d.sections:
 h=s.header.paragraphs[0]; h.text='两湖隧道（南湖段）智能运维管理平台｜项目论文'; h.alignment=WD_ALIGN_PARAGRAPH.RIGHT
 f=s.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.CENTER
 fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); f._p.append(fld)
d.save(OUT)
print(OUT)
