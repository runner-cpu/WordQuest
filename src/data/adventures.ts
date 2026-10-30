/** 原创情景阅读：每章从日常信息理解，递进到推断与观点表达。 */
export interface AdventureQuestion {
  id: string
  prompt: string
  options: string[]
  answer: number
  explanation: string
  skill: 'meaning' | 'inference' | 'expression'
}

export interface AdventureScene {
  id: string
  title: string
  chapter: string
  level: 'A2' | 'B1' | 'B2'
  goal: string
  intro: string
  dialogue: { speaker: string; en: string; zh: string }[]
  vocabulary: { word: string; meaning: string }[]
  questions: AdventureQuestion[]
}

export const ADVENTURE_SCENES: AdventureScene[] = [
  {
    id: 'campus-library', title: '给讨论找个位置', chapter: '校园', level: 'A2',
    goal: '读懂借阅规则，并礼貌预约讨论室',
    intro: '你和同学准备做课堂展示。先向图书管理员了解借书和讨论空间的安排。',
    dialogue: [
      { speaker: 'Student', en: 'Hello. Can I borrow this book? My classmate and I need it for our presentation on Friday.', zh: '你好，我能借这本书吗？我和同学周五做展示要用。' },
      { speaker: 'Librarian', en: 'Yes. You can keep it for two weeks. Please bring it back to this desk.', zh: '可以，你能借两周。请把书还到这个服务台。' },
      { speaker: 'Student', en: 'Thanks. Can we talk about our presentation at the tables here?', zh: '谢谢。我们可以在这边的桌子上讨论展示吗？' },
      { speaker: 'Librarian', en: 'These tables are for quiet reading. There is a discussion room upstairs. You can reserve it with your student card.', zh: '这些桌子供安静阅读。楼上有讨论室，你可以用学生卡预约。' },
    ],
    vocabulary: [
      { word: 'borrow', meaning: '借入' }, { word: 'presentation', meaning: '展示；报告' },
      { word: 'quiet', meaning: '安静的' }, { word: 'reserve', meaning: '预约' },
    ],
    questions: [
      { id: 'campus-library-meaning', skill: 'meaning', prompt: '管理员说“bring it back”，希望学生怎么做？', options: ["Take the book to class.","Return the book to the desk.","Read the book at the desk.","Share the book with a friend."], answer: 1, explanation: 'bring it back意为“把它带回来”。这里的it指借出的书，管理员要求还书到服务台。' },
      { id: 'campus-library-inference', skill: 'inference', prompt: '为什么讨论室更适合这两位学生？', options: ["They can keep books there for longer.","They can enter without a student card.","They want to read alone after class.","They need a place where they can talk."], answer: 3, explanation: '学生需要一起讨论展示，而楼下桌子仅供安静阅读，因此适合去允许交流的讨论室。没有证据表明那里能延长借期或免卡进入。' },
      { id: 'campus-library-expression', skill: 'expression', prompt: '学生想接着礼貌询问能否预约明天的讨论室，哪句最合适？', options: ["Could I reserve the room for tomorrow?","I can return the book tomorrow.","Is this desk for quiet reading?","Do you need my presentation tomorrow?"], answer: 0, explanation: 'Could I reserve…?是礼貌提出预约请求的表达，for tomorrow说明预约日期。其他选项没有提出预约讨论室的请求。' },
    ],
  },
  {
    id: 'campus-project', title: '问卷先试一次', chapter: '校园', level: 'B1',
    goal: '理解小组研究计划，判断试填问卷的作用',
    intro: '小组准备调查学生怎样选择午餐。正式发问卷前，两位组员在核对计划。',
    dialogue: [
      { speaker: 'Maya', en: 'I have written ten questions for our lunch survey. Shall we send it to everyone tonight?', zh: '我给午餐调查写了十个问题。今晚就发给所有人吗？' },
      { speaker: 'Leo', en: 'First, could we ask five students to try it? Question four asks about affordable meals, but people may understand affordable differently.', zh: '能先请五位学生试填吗？第四题问价格实惠的饭菜，但大家对“实惠”的理解可能不同。' },
      { speaker: 'Maya', en: 'Good point. We could give a price range instead. I will also ask the five students which questions seem unclear.', zh: '有道理。我们可以改成具体价格区间，也请这五位学生指出不清楚的问题。' },
      { speaker: 'Leo', en: 'Great. After we improve the wording, we can share the final version with students from several different courses.', zh: '好。改进措辞后，再把最终版发给几个不同专业的学生。' },
    ],
    vocabulary: [
      { word: 'survey', meaning: '调查；问卷' }, { word: 'affordable', meaning: '负担得起的；价格实惠的' },
      { word: 'price range', meaning: '价格区间' }, { word: 'wording', meaning: '措辞' },
    ],
    questions: [
      { id: 'campus-project-meaning', skill: 'meaning', prompt: '在这段对话中，“improve the wording”主要指什么？', options: ["Add more students to the survey.","Choose a new topic for the project.","Make the questions easier to understand.","Make the survey look more colourful."], answer: 2, explanation: 'Leo指出affordable含义不够明确，Maya提出改成价格区间。因此改进wording是让题意更清楚，而非扩大样本或改变版式。' },
      { id: 'campus-project-inference', skill: 'inference', prompt: '先让五位学生试填，最可能帮助小组避免什么问题？', options: ["Inviting students from different courses.","Collecting answers to confusing questions.","Spending too much money on lunch.","Finishing the final version before tonight."], answer: 1, explanation: '试填者将指出不清楚的题目，小组能在大规模收集数据前修改问卷，避免得到因题意模糊而难以比较的答案。' },
      { id: 'campus-project-expression', skill: 'expression', prompt: 'Maya想请试填者指出不清楚的问题，哪句最合适？', options: ["Could you send this survey to everyone now?","You should choose the cheapest meal here.","Please answer only questions about your course.","Please tell us if any question is unclear."], answer: 3, explanation: 'Please tell us if…明确邀请对方反馈理解上的困难，与试填目的相符。其他选项要求转发、选餐或缩小作答范围。' },
    ],
  },
  {
    id: 'campus-seminar', title: '两个数字为何不同', chapter: '校园', level: 'B2',
    goal: '识别统计口径差异，谨慎比较研究结论',
    intro: '研讨课上，两份关于学习应用的报告给出不同数字。你需要判断它们是否真的互相矛盾。',
    dialogue: [
      { speaker: 'Nina', en: 'One report says seventy percent of students use learning apps, while another gives only forty percent. Their findings seem inconsistent.', zh: '一份报告说七成学生使用学习应用，另一份只有四成。它们的结果似乎不一致。' },
      { speaker: 'Tutor', en: 'Check how each report defines use. The first includes anyone who opened an app once during the term.', zh: '看看各自怎样定义“使用”。第一份把学期内打开过一次应用的人也算进去了。' },
      { speaker: 'Nina', en: 'The second counts only weekly users. So the figures describe different habits, even though both reports surveyed students at our university.', zh: '第二份只统计每周使用的人。所以两个数字描述的是不同习惯，虽然调查对象都是我们学校的学生。' },
      { speaker: 'Tutor', en: 'Exactly. Before claiming that one study is wrong, compare the definitions. You can discuss the difference without treating either figure as a mistake.', zh: '对。在断言某项研究错误前，先比较定义。你可以讨论差异，不必把任一数字当成错误。' },
    ],
    vocabulary: [
      { word: 'inconsistent', meaning: '不一致的' }, { word: 'define', meaning: '定义；界定' },
      { word: 'figure', meaning: '数字；数据' }, { word: 'claim', meaning: '声称；断言' },
    ],
    questions: [
      { id: 'campus-seminar-meaning', skill: 'meaning', prompt: '两份报告中“use”的具体口径有什么区别？', options: ["One includes occasional users; the other requires weekly use.","One measures satisfaction; the other measures cost.","One studies teachers; the other studies students.","One counts downloads; the other counts paid subscriptions."], answer: 0, explanation: '第一份只要求学期内打开过一次，包含偶尔使用者；第二份要求每周使用。两者都调查学生，并未比较费用或付费订阅。' },
      { id: 'campus-seminar-inference', skill: 'inference', prompt: '根据对话，对70%和40%最谨慎的判断是什么？', options: ["The larger figure must come from a better study.","The smaller figure proves that app use is falling.","Both figures may be valid under their different definitions.","Both studies must have used exactly the same questions."], answer: 2, explanation: '统计口径不同足以解释数字差异，因此二者可能各自成立。仅凭这两个数字不能判断研究优劣，也不能推出使用率随时间下降。' },
      { id: 'campus-seminar-expression', skill: 'expression', prompt: 'Nina想在报告中说明这一比较限制，哪句最恰当？', options: ["The studies agree that seventy percent use an app every week.","The forty percent figure should be removed because it is smaller.","These percentages are not directly comparable because use is defined differently.","Different definitions show that neither study contains useful information."], answer: 2, explanation: '正确句指出数字不能直接比较，并准确解释原因是定义不同；它保留研究可能有效的空间，避免没有依据地判错或否定价值。' },
    ],
  },
  {
    id: 'city-museum', title: '周一改走哪条路', chapter: '城市旅行', level: 'A2',
    goal: '读懂开放时间与交通信息，调整当天行程',
    intro: '周一早上，你在车站问路，准备去参观城市博物馆。',
    dialogue: [
      { speaker: 'Visitor', en: 'Excuse me. Does the number six bus stop near the city museum? I want to visit it this morning.', zh: '打扰一下，六路车在城市博物馆附近停吗？我想今天上午去参观。' },
      { speaker: 'Local', en: 'Yes, but the museum is closed on Mondays. The art gallery across the road is open today.', zh: '停，但博物馆周一闭馆。马路对面的美术馆今天开放。' },
      { speaker: 'Visitor', en: 'Today is Monday, so I will try the gallery. Can I take the same bus there?', zh: '今天是周一，那我去美术馆吧。我也能坐这趟车到那里吗？' },
      { speaker: 'Local', en: 'You can. Get off at Park Street and cross at the lights. The gallery entrance is beside the cafe.', zh: '可以。在公园街下车，到信号灯处过马路。美术馆入口就在咖啡馆旁边。' },
    ],
    vocabulary: [
      { word: 'closed', meaning: '关闭的；不开放的' }, { word: 'gallery', meaning: '美术馆；画廊' },
      { word: 'get off', meaning: '下车' }, { word: 'entrance', meaning: '入口' },
    ],
    questions: [
      { id: 'city-museum-meaning', skill: 'meaning', prompt: '游客要去美术馆，应该在哪一站下车？', options: ["At the city station.","At the next cafe.","At the museum entrance.","At Park Street."], answer: 3, explanation: '当地人明确说Get off at Park Street，即在公园街下车；随后才过马路去咖啡馆旁的入口。' },
      { id: 'city-museum-inference', skill: 'inference', prompt: '游客为什么决定改去美术馆？', options: ["The museum is closed on the day of the visit.","The museum is too far from the bus stop.","The gallery has a special morning ticket.","The number six bus no longer goes to the museum."], answer: 0, explanation: '博物馆周一闭馆，而当天正是周一；美术馆开放，所以游客调整了计划。对话没有提到特别门票或公交改线。' },
      { id: 'city-museum-expression', skill: 'expression', prompt: '游客想确认自己理解的下车地点，哪句最合适？', options: ["What time does the cafe close?","So I should get off at Park Street, right?","Can I visit the museum next Monday?","Do you work at the art gallery?"], answer: 1, explanation: 'So…right?可以复述关键信息并请求确认。这句准确核对下车站点，其他选项询问的是不同信息。' },
    ],
  },
  {
    id: 'city-guesthouse', title: '晚到也能入住', chapter: '城市旅行', level: 'B1',
    goal: '理解晚到入住安排，并提出必要的确认请求',
    intro: '火车晚点了。你给已经预订的旅馆打电话，说明自己将比原计划晚到。',
    dialogue: [
      { speaker: 'Guest', en: 'My train has been delayed. I will reach your guesthouse at about nine tonight instead of seven. Is that a problem?', zh: '我的火车晚点了。我今晚大约九点到旅馆，原本计划七点。这样会有问题吗？' },
      { speaker: 'Host', en: 'Reception closes at eight, but your room is ready. We can send you instructions for collecting the key from a locked box.', zh: '前台八点下班，但房间已经准备好了。我们可以给你发送从带锁盒子取钥匙的说明。' },
      { speaker: 'Guest', en: 'That would help. Could you include a photo of the entrance? I have not visited this street before.', zh: '那就太好了。能附上入口的照片吗？我以前没来过这条街。' },
      { speaker: 'Host', en: 'Certainly. Please confirm that you received the message before boarding. We can complete the remaining paperwork at reception tomorrow morning.', zh: '当然。请在上车前确认收到信息。剩下的手续明早可以在前台办理。' },
    ],
    vocabulary: [
      { word: 'delayed', meaning: '延误的' }, { word: 'reception', meaning: '前台；接待处' },
      { word: 'instructions', meaning: '操作说明；指引' }, { word: 'paperwork', meaning: '文书手续' },
    ],
    questions: [
      { id: 'city-guesthouse-meaning', skill: 'meaning', prompt: '旅馆为晚到的客人安排了什么取钥匙方式？', options: ["Collect it from reception before eight tonight.","Follow a message to collect it from a locked box.","Ask the train driver to bring it to the station.","Wait outside until reception opens tomorrow."], answer: 1, explanation: '房东会发送说明，让客人从带锁的盒子取钥匙。明早办理的是剩余手续，客人无需在门外等到第二天。' },
      { id: 'city-guesthouse-inference', skill: 'inference', prompt: '房东为什么要求客人在上车前确认收到信息？', options: ["To decide whether the train should depart.","To ask the guest to finish all paperwork on the train.","To make sure the guest has access instructions before arriving late.","To arrange for reception to stay open until nine."], answer: 2, explanation: '客人到达时前台已经关闭，提前确认收到取钥匙说明，能减少晚到后无法入住的风险。房东并未承诺延长前台营业时间。' },
      { id: 'city-guesthouse-expression', skill: 'expression', prompt: '收到说明后，客人想确认收到并接受明早补办手续，哪句最合适？', options: ["I have received the instructions and will finish the paperwork tomorrow.","Please cancel my room because reception closes early.","I will come at seven and collect the key from reception.","You should send the key to the station before I board."], answer: 0, explanation: '这句同时完成“确认收到说明”和“接受明早办理手续”两件事，符合双方已商定的安排。其他句子改变或否定了原安排。' },
    ],
  },
  {
    id: 'city-riverside', title: '给河岸留一点空间', chapter: '城市旅行', level: 'B2',
    goal: '理解旅游限制的目的，并提出兼顾体验与保护的方案',
    intro: '你准备安排河岸游览。旅行顾问提醒，一段热门步道正在限制游客进入。',
    dialogue: [
      { speaker: 'Traveller', en: 'The riverside boardwalk is the highlight of my trip. Why does your suggested route skip the northern section?', zh: '河边木栈道是我这趟旅行最期待的部分。你推荐的路线为什么跳过北段？' },
      { speaker: 'Adviser', en: 'That section is temporarily closed to protect nesting birds. The southern path remains open, with a viewing deck beyond the bridge.', zh: '北段暂时关闭，保护正在筑巢的鸟类。南侧步道仍开放，桥那边还有观景台。' },
      { speaker: 'Traveller', en: 'I would still like to see the river. Is there an option that also supports people living nearby?', zh: '我还是想看看河景。有没有也能支持附近居民的选择？' },
      { speaker: 'Adviser', en: 'A local guide leads walks along the southern path and finishes at the community market. It costs more than walking alone, but respects the closure.', zh: '本地导游会带大家沿南侧步道走，最后到社区集市。费用比自己走高，但遵守封闭规定。' },
    ],
    vocabulary: [
      { word: 'highlight', meaning: '最精彩或最期待的部分' }, { word: 'temporarily', meaning: '暂时地' },
      { word: 'viewing deck', meaning: '观景台' }, { word: 'closure', meaning: '关闭；封闭安排' },
    ],
    questions: [
      { id: 'city-riverside-meaning', skill: 'meaning', prompt: '顾问说这条路线“respects the closure”，意思是什么？', options: ["It visits the northern section after dark.","It makes the closed section cheaper to enter.","It avoids entering the section that is currently closed.","It asks visitors to decide which sections should close."], answer: 2, explanation: 'respect the closure在这里指遵守封闭规定。导游走的是仍开放的南侧步道，不会绕过限制进入北段。' },
      { id: 'city-riverside-inference', skill: 'inference', prompt: '与独自步行相比，导游路线最符合游客的哪项额外诉求？', options: ["Reaching the closed northern section with special permission.","Reducing the total cost of the visit.","Avoiding all contact with local residents.","Supporting the local community while still seeing the river."], answer: 3, explanation: '游客希望支持附近居民，本地导游和社区集市与此相符，同时路线仍能看河景。对话明确说费用更高，也没有进入北段的特许。' },
      { id: 'city-riverside-expression', skill: 'expression', prompt: '游客愿意接受建议，但想先了解费用，哪句最恰当？', options: ["I will use the northern section if there is no guide.","The southern route sounds suitable; could you tell me the price?","I assume the guided walk is free because the north is closed.","Please reopen the boardwalk before we discuss the price."], answer: 1, explanation: '这句先认可可行路线，再礼貌询价，既符合游客看河景和支持社区的目标，也遵守封闭安排。其他说法违背限制或无根据地假设免费。' },
    ],
  },
  {
    id: 'work-first-day', title: '会议前的十五分钟', chapter: '工作观点', level: 'A2',
    goal: '读懂准备任务和时间安排，提出借用设备的请求',
    intro: '实习第一天，同事请你帮忙准备一场九点开始的小型会议。',
    dialogue: [
      { speaker: 'Colleague', en: 'Our meeting starts at nine in Room Three. Can you put six chairs around the table before then?', zh: '会议九点在三号会议室开始。你能提前在桌子周围放好六把椅子吗？' },
      { speaker: 'Intern', en: 'Sure. Do we also need a screen for your slides? I can bring the small projector from the office.', zh: '可以。放幻灯片还需要屏幕吗？我可以把办公室的小投影仪拿来。' },
      { speaker: 'Colleague', en: 'Yes, please. Let us meet there at eight forty-five so we can test it before the visitors arrive.', zh: '需要，谢谢。我们八点四十五在那里碰面，在访客到来前测试一下。' },
      { speaker: 'Intern', en: 'All right. I will prepare the chairs first and bring the projector. Please show me how to connect it.', zh: '好的。我先准备椅子，再把投影仪拿来。请教我怎么连接。' },
    ],
    vocabulary: [
      { word: 'meeting', meaning: '会议' }, { word: 'slides', meaning: '幻灯片' },
      { word: 'projector', meaning: '投影仪' }, { word: 'connect', meaning: '连接' },
    ],
    questions: [
      { id: 'work-first-day-meaning', skill: 'meaning', prompt: '同事和实习生约定几点在会议室碰面？', options: ["At eight forty-five.","At eight fifteen.","At eight thirty.","At nine fifteen."], answer: 0, explanation: '同事明确说at eight forty-five，即八点四十五。会议九点开始，但两人提前碰面测试设备。' },
      { id: 'work-first-day-inference', skill: 'inference', prompt: '两人为什么要在会议开始前十五分钟碰面？', options: ["To move the meeting to another room.","To check the projector before the meeting begins.","To finish the visitors' slides for them.","To wait until all the visitors have left."], answer: 1, explanation: '同事希望在访客到来前test it，这里的it指投影仪。提前测试能检查设备是否可用，而不是修改会议地点或替访客做幻灯片。' },
      { id: 'work-first-day-expression', skill: 'expression', prompt: '实习生去办公室借投影仪时，哪句请求最合适？', options: ["Can you move our meeting to tomorrow?","Would you like to sit near the screen?","Should I ask the visitors to bring six chairs?","Could I borrow the small projector for our meeting?"], answer: 3, explanation: 'Could I borrow…?礼貌表达借用物品的请求，并交代用于会议。其他选项没有提出借用投影仪的需求。' },
    ],
  },
  {
    id: 'work-deadline', title: '先说清楚再交付', chapter: '工作观点', level: 'B1',
    goal: '理解交付期限与数据状态，主动说明工作风险',
    intro: '你要为中午的客户演示准备图表，但一份更新后的数据还没有到。',
    dialogue: [
      { speaker: 'Assistant', en: 'The sales team has not sent the revised figures yet. I can finish the chart by ten, but it would use yesterday\'s numbers.', zh: '销售团队还没发修订后的数字。我十点能完成图表，但只能使用昨天的数据。' },
      { speaker: 'Manager', en: 'Our client presentation is at noon. Please send me that draft, clearly marked as preliminary, and check when the new figures will arrive.', zh: '客户演示在中午。请先把草稿发给我，清楚标上“初步版本”，再确认新数据何时到。' },
      { speaker: 'Assistant', en: 'If the update arrives after eleven, I may not have time to check every figure. Should I let you know then?', zh: '如果更新十一点以后才到，我可能来不及核对所有数字。到时候我该告诉你吗？' },
      { speaker: 'Manager', en: 'Tell me as soon as you hear about a delay. That gives us time to adjust the presentation rather than rush unchecked numbers to the client.', zh: '一听说会延迟就告诉我。这样我们有时间调整演示，不必仓促把未核对的数据交给客户。' },
    ],
    vocabulary: [
      { word: 'revised', meaning: '修订后的' }, { word: 'draft', meaning: '草稿；初稿' },
      { word: 'preliminary', meaning: '初步的；尚未最终确认的' }, { word: 'adjust', meaning: '调整' },
    ],
    questions: [
      { id: 'work-deadline-meaning', skill: 'meaning', prompt: '经理要求把图表标为“preliminary”，是要说明什么？', options: ["It has already been checked with the client.","It should be removed from every presentation.","It contains only next month's sales targets.","It is a draft that may still need updating."], answer: 3, explanation: 'preliminary表示初步版本。草稿使用昨天的数据，仍需根据修订数据更新，不能把它当作已经核实的最终结果。' },
      { id: 'work-deadline-inference', skill: 'inference', prompt: '经理为什么希望尽早获知延迟？', options: ["To keep the client from asking any questions.","To avoid preparing a draft before ten.","To leave time for changing the presentation plan.","To let the assistant skip checking the final figures."], answer: 2, explanation: '经理说提前告知能留出时间adjust the presentation。重点是调整安排、避免未经核对的数据被仓促交付，而非取消核对。' },
      { id: 'work-deadline-expression', skill: 'expression', prompt: '销售团队确认新数据要十一点半才到，助理现在应如何报告？', options: ["The update is due at eleven thirty, so we may need to adjust the presentation.","The final figures are ready, so no change is needed.","I will wait until noon before mentioning the update.","Yesterday's numbers are final because the new ones are late."], answer: 0, explanation: '这句及时提供新的到达时间，并指出对演示安排的影响，符合经理要求尽早报告风险的意图。其他选项隐瞒延迟或把旧数据误当最终数据。' },
    ],
  },
  {
    id: 'work-hybrid', title: '怎样衡量远程试行', chapter: '工作观点', level: 'B2',
    goal: '比较工作安排的评价标准，提出有依据的试行方案',
    intro: '团队讨论每周两天远程办公的试行方案。你需要区分可观察的工作成果与在线状态。',
    dialogue: [
      { speaker: 'Team Lead', en: 'Some colleagues want two remote days each week. I am open to a trial, but we need clear ways to evaluate it.', zh: '有同事希望每周远程办公两天。我愿意试行，但我们需要明确的评估方式。' },
      { speaker: 'Analyst', en: 'Could we compare completed projects and response times during agreed working hours? Being online all day does not necessarily mean useful work is getting done.', zh: '能比较项目完成情况和约定工作时间内的回复速度吗？全天在线未必意味着完成了有价值的工作。' },
      { speaker: 'Team Lead', en: 'Agreed. We should also ask whether coordination becomes harder, especially for people whose tasks depend on quick decisions from others.', zh: '同意。还应了解协作是否变困难，尤其是那些任务依赖他人快速决策的同事。' },
      { speaker: 'Analyst', en: 'Then let us run a four-week pilot and review both delivery records and team feedback before deciding whether to continue.', zh: '那就试行四周，再综合交付记录和团队反馈，决定是否继续。' },
    ],
    vocabulary: [
      { word: 'evaluate', meaning: '评估' }, { word: 'coordination', meaning: '协调；协作' },
      { word: 'pilot', meaning: '试行；试点' }, { word: 'delivery', meaning: '工作成果的交付' },
    ],
    questions: [
      { id: 'work-hybrid-meaning', skill: 'meaning', prompt: '这里的“a four-week pilot”具体指什么？', options: ["A permanent change announced four weeks ago.","A training course for new project managers.","A limited trial of the proposed work arrangement.","A weekly report written by one remote worker."], answer: 2, explanation: 'pilot在这里是试行或试点。团队先实行四周，再依据记录和反馈决定是否继续，因此并非立即作出永久决定。' },
      { id: 'work-hybrid-inference', skill: 'inference', prompt: '为什么团队既看交付记录，也收集团队反馈？', options: ["Output alone may miss difficulties in working together.","Online status has already proved that the plan works.","Feedback can replace all checks on project completion.","Every colleague has the same tasks and response needs."], answer: 0, explanation: '交付记录能反映成果，但未必揭示协作过程中的困难。负责人特别提到任务依赖快速决策的同事，因此需要结合反馈，而非只看产出。' },
      { id: 'work-hybrid-expression', skill: 'expression', prompt: '试行结束后，哪句建议最符合双方约定的决策方式？', options: ["Let us continue because several colleagues prefer staying home.","Before deciding, let us review project delivery and coordination feedback.","We should judge the trial only by hours shown online.","The trial must end because remote work always slows decisions."], answer: 1, explanation: '双方约定同时查看交付记录和团队反馈，再决定是否继续。正确句遵循这一证据标准，避免仅凭偏好、在线时长或绝对化判断下结论。' },
    ],
  },
]
