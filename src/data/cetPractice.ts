/** 原创四六级专项短练，不是真题、完整模拟卷或考试分数预测。 */
export type CetLevel = 'cet4' | 'cet6'
export type CetPracticeKind = 'reading' | 'writing' | 'translation'

export interface CetReadingQuestion {
  id: string
  prompt: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
  evidence: string
  explanation: string
  skill: string
}

interface Base {
  id: string
  title: string
  examType: CetLevel
  kind: CetPracticeKind
  minutes: number
  focus: string
}

export interface CetReading extends Base {
  kind: 'reading'
  passage: string[]
  questions: CetReadingQuestion[]
}

export interface CetOutput extends Base {
  kind: 'writing' | 'translation'
  prompt: string
  sourceText?: string
  wordRange: [number, number]
  outline: string[]
  reference: string
  notes: string[]
  checklist: string[]
}

export type CetPractice = CetReading | CetOutput

export const CET_PRACTICES: CetPractice[] = [
  {
    id: 'cet4-reading-1', title: '校园换书角为什么搬家', examType: 'cet4', kind: 'reading', minutes: 8,
    focus: '细节定位、原因推断与主旨；原创篇章短练，非完整真题',
    passage: [
      'At West Hill College, a student club opened a book exchange beside the library entrance. Students could leave a book and take another without paying. During the first week, many people stopped to look. By the following month, however, fewer students were using the shelves, although plenty of books remained.',
      'Club members first thought students had lost interest in reading. They then asked visitors a few simple questions. Several said the entrance was too busy for choosing a book carefully. Others could not tell whether the books were available to borrow or to keep. A larger collection alone would not solve these problems.',
      'The club moved the shelves to a quiet corner near the reading room. It added a sign explaining the exchange and placed short student reviews beside some books. Students were still welcome to take a book without leaving one immediately. The club wanted the service to be useful, rather than to count every exchange.',
      'Over the next few weeks, more students began spending time at the corner. Some returned with books they had finished, while others came to read the reviews. The members did not describe this as proof that every college should copy their plan. They had learned to ask users before deciding what needed to change.',
    ],
    questions: [
      {
        id: 'cet4-reading-1-q1', prompt: 'What made it difficult for some students to choose a book?',
        options: ['The entrance was too crowded.', 'The books cost too much.', 'The shelves were nearly empty.', 'The library closed too early.'], answer: 0,
        evidence: 'Several said the entrance was too busy for choosing a book carefully.',
        explanation: '定位第二段。too busy 指入口来往人多，不方便慢慢选书；原文说明换书免费，也没有说书架空了或图书馆早关门。', skill: '细节定位',
      },
      {
        id: 'cet4-reading-1-q2', prompt: 'Why did the club add a sign near the shelves?',
        options: ['To advertise a paid reading course.', 'To ask students to buy more books.', 'To make the exchange rules clearer.', 'To record each visitor’s name.'], answer: 2,
        evidence: 'Others could not tell whether the books were available to borrow or to keep.',
        explanation: '第二段提出问题：学生不知道书是借走还是留下；第三段的说明牌正是回应这个困惑。先找问题，再把措施与目的对应起来。', skill: '原因推断',
      },
      {
        id: 'cet4-reading-1-q3', prompt: 'What is the main lesson of the passage?',
        options: ['A larger collection always attracts readers.', 'Useful improvements begin with understanding users.', 'Book exchanges should have strict payment rules.', 'Every college needs an identical reading corner.'], answer: 1,
        evidence: 'They had learned to ask users before deciding what needed to change.',
        explanation: '末句点明主旨，前文调查、换位置和解释规则都是支撑。always 和 every 扩大了结论；作者明确没有证明所有学校都应照搬。', skill: '主旨判断',
      },
    ],
  },
  {
    id: 'cet4-reading-2', title: '一张公交提示牌怎样变好用', examType: 'cet4', kind: 'reading', minutes: 8,
    focus: '措施目的、信息核对与概括；原创篇章短练，非完整真题',
    passage: [
      'For students living outside Greenfield College, the morning bus is an important link to campus. When road work changed its route, the transport office posted a notice online. The notice listed every affected stop, but students still arrived at the wrong place. Some had read only the first few lines on their phones.',
      'The office invited a small group of students to discuss the notice. They explained that it began with a long description of the road work. The new boarding point appeared near the bottom, after several other details. Students wanted to know where to go before learning why the change had happened.',
      'A revised notice put the new stop and starting date at the top. A simple map showed the walking route from the old stop. The office also placed printed copies where passengers usually waited. This helped students who did not check the website and visitors who were unfamiliar with the campus.',
      'The change did not remove every difficulty. Heavy rain could still make the walk unpleasant, and the bus sometimes arrived late. Staff therefore kept a contact number on the notice so passengers could report problems. Clear information could not control the weather, but it could help people make better plans before leaving home.',
    ],
    questions: [
      {
        id: 'cet4-reading-2-q1', prompt: 'Why was the original notice difficult to use?',
        options: ['It gave no reason for the road work.', 'It could only be read at the bus stop.', 'It was written for drivers rather than students.', 'It placed the most useful travel detail too late.'], answer: 3,
        evidence: 'The new boarding point appeared near the bottom, after several other details.',
        explanation: '第二段说明新乘车点埋在后面，是信息顺序的问题。第一段说通知发布在网上，不能推出只能在车站看。', skill: '细节定位',
      },
      {
        id: 'cet4-reading-2-q2', prompt: 'Who could especially benefit from the printed copies?',
        options: ['Passengers who had already bought a new car.', 'People who did not check the website.', 'Workers repairing the road at night.', 'Students who wanted the old route cancelled.'], answer: 1,
        evidence: 'This helped students who did not check the website and visitors who were unfamiliar with the campus.',
        explanation: 'This 回指张贴纸质通知和地图等措施，受益者包括不查网站的学生与不熟悉校园的访客。不要把道路维修人员当成通知的主要读者。', skill: '指代与细节',
      },
      {
        id: 'cet4-reading-2-q3', prompt: 'Which statement best describes the revised notice?',
        options: ['It improved planning without solving every transport problem.', 'It guaranteed that the bus would always arrive on time.', 'It made printed information unnecessary.', 'It persuaded passengers to stop reporting problems.'], answer: 0,
        evidence: 'Clear information could not control the weather, but it could help people make better plans before leaving home.',
        explanation: '末段保留天气和晚点的限制，同时肯定清楚信息的作用。正确项概括这种有限但实际的改善；guaranteed 和 always 都超出原文。', skill: '概括与限定',
      },
    ],
  },
  {
    id: 'cet4-writing-1', title: '给共享自习室提一条建议', examType: 'cet4', kind: 'writing', minutes: 15,
    focus: '明确问题、提出可执行建议并解释好处；原创写作短练',
    prompt: 'Your college is collecting suggestions for improving a shared study room. Write a short article describing one common problem, proposing a practical change, and explaining how it would help students. Write 120–180 words. 不必提供真实校名或个人信息。',
    wordRange: [120, 180],
    outline: ['先说明一个具体问题：安静阅读和小组讨论混在一起。', '提出一项能执行的改变，并交代如何实施。', '解释学生会怎样受益，最后给出适度结论。'],
    reference: 'A shared study room should support different ways of learning. In our room, however, quiet readers often sit beside groups preparing presentations. Neither group is doing anything wrong, but their needs can easily conflict.\n\nI suggest dividing the room into a quiet area and a discussion area. Clear signs would help students choose a suitable place when they enter. If space is limited, the college could set aside certain hours for group work instead. Students should be invited to comment after a short trial so that the arrangement can be adjusted.\n\nThis change would make expectations clearer and reduce unnecessary arguments. It would also remind us to consider other learners, rather than simply asking everyone to work in the same way. A useful study room needs thoughtful rules as well as comfortable chairs.',
    notes: ['参考先承认两类学生都有合理需求，再提出安排，避免只责备某一方。', 'If space is limited 给建议加上现实条件；参考不是唯一写法，也不代表自动评分标准。'],
    checklist: ['我是否写清一个具体问题，而非只说“环境不好”？', '我的建议是否说明了谁来做、怎么做或何时做？', '我是否解释至少一个好处，并检查主谓一致和句子完整性？'],
  },
  {
    id: 'cet4-writing-2', title: '如何平衡兼职与学习', examType: 'cet4', kind: 'writing', minutes: 15,
    focus: '提出立场、举具体做法并回应风险；原创写作短练',
    prompt: 'Some university students choose to work part time. Write a short article giving your view on balancing part-time work and study. Include one possible benefit, one risk, and a practical way to manage the two. Write 120–180 words.',
    wordRange: [120, 180],
    outline: ['表达平衡立场：兼职可以有益，但不能挤占必要学习时间。', '分别说明一个好处与一个风险，用具体情境支撑。', '给出时间安排或沟通方式，并收束观点。'],
    reference: 'Part-time work can be a useful part of university life if students manage it carefully. A job may help them cover daily costs and learn how to communicate with people outside the classroom. These experiences can be valuable, but they should not replace the main purpose of attending college.\n\nThe greatest risk is accepting more working hours than a student can handle. Someone who finishes a late shift may struggle to prepare for the next morning’s class. To avoid this problem, students should plan study time first and agree on realistic working hours with their employer. During busy examination weeks, they may need to reduce those hours.\n\nBalance does not mean spending equal time on everything. It means making choices that protect essential learning while leaving room for useful experience. Students should review their arrangements whenever their workload changes.',
    notes: ['首句的 if 限定条件，比直接宣布兼职“一定有益”更稳妥。', '参考按好处、风险、办法展开；也可支持其他立场，但需要理由和可行建议。'],
    checklist: ['我是否写出了明确立场，并兼顾一项好处和一项风险？', '我是否用一个具体情境说明时间冲突，而非堆砌抽象词？', '我是否给出可行办法，并核对连接词与代词指向？'],
  },
  {
    id: 'cet4-translation-1', title: '把传统手工艺带进校园', examType: 'cet4', kind: 'translation', minutes: 12,
    focus: '活动介绍、目的表达与信息完整；原创汉译英短练',
    prompt: '将下面关于校园手工艺活动的中文段落译成英文。先保证活动安排、参与方式和目的准确，再调整表达；下方英文词数仅为本题参考范围，不是考试官方要求。',
    sourceText: '学校计划在周末为全校学生举办传统手工艺体验活动。学生可以学习剪纸，也可以尝试制作简单的灯笼。活动不要求参与者事先具备相关经验，老师会先演示基本步骤，再让大家独立完成作品。组织者希望学生在动手的过程中了解文化，而不只是记住几个名称。活动结束后，作品将在图书馆展出。想参加的学生应提前报名，以便学校准备足够的材料。',
    wordRange: [80, 150],
    outline: ['先识别时间、两种活动、无需经验及演示步骤。', '用目的结构表达“为了了解文化”和“以便准备材料”。', '检查展出地点与提前报名要求是否遗漏。'],
    reference: 'The college plans to hold a traditional craft workshop for all students at the weekend. Students can learn paper cutting or try making simple lanterns. No previous experience is required. A teacher will demonstrate the basic steps before students complete their own work. The organisers hope that students will learn about culture through practical activities, rather than simply memorising a few names. After the workshop, the finished pieces will be displayed in the library. Students who wish to take part should register in advance so that the college can prepare enough materials.',
    notes: ['译法不唯一。traditional craft workshop、a workshop on traditional crafts 都可表达活动性质。', '参考将长中文句适当拆开；不要遗漏“无需经验”“图书馆展出”或报名目的。英文词数范围仅用于本题练习参考。'],
    checklist: ['我是否准确保留时间、活动内容、展出地点和报名要求？', '我是否表达“先演示再独立完成”与“报名是为备材料”的关系？', '我是否检查时态、单复数和拼写，并避免逐字拼接长句？'],
  },
  {
    id: 'cet4-translation-2', title: '社区图书车的周末安排', examType: 'cet4', kind: 'translation', minutes: 12,
    focus: '公共服务安排、条件与建议；原创汉译英短练',
    prompt: '将下面关于社区图书服务的中文段落译成英文。注意服务地点、使用条件与天气变化时的安排；英文词数范围为练习参考，不是官方要求。',
    sourceText: '社区准备每周六安排一辆图书车到附近居民常去的广场，为不方便去图书馆的居民提供服务。车上既有儿童故事书，也有适合成年人的读物。居民可以免费借书，但需要携带借书证。工作人员还会帮助老年人了解借阅规则。如果遇到大雨，活动将改到社区中心举行。组织者建议居民出门前查看最新通知，归还图书时也可以提出希望增加的书目。',
    wordRange: [80, 150],
    outline: ['交代每周六、广场和服务对象，不把计划写成已发生事实。', '区分免费服务与仍需借书证的条件。', '表达雨天替代地点、查看通知与推荐书目。'],
    reference: 'The community plans to send a mobile library every Saturday to a nearby square often visited by residents. It will serve people who find it difficult to visit the library. It will carry both children’s storybooks and books for adults. Residents can borrow books free of charge, but they need to bring their library cards. Staff will also help older people understand the borrowing rules. If it rains heavily, the event will move to the community centre. The organisers advise residents to check the latest notice before leaving home. When returning books, they can also suggest titles they would like the service to add.',
    notes: ['译法不唯一。mobile library 可自然表达“图书车”，无需逐字译出“汽车”。', 'plans to 与 will 保留计划语气；if 引导天气条件。英文词数范围只为参考译文长度。'],
    checklist: ['我是否保留服务频率、地点、对象和借书证条件？', '我是否译清大雨时改地点，而非取消服务？', '我是否核对建议的对象和内容，避免漏掉推荐书目？'],
  },
  {
    id: 'cet6-reading-1', title: '学习工具试行，怎样才算有效', examType: 'cet6', kind: 'reading', minutes: 10,
    focus: '区分证据与结论、识别评价局限；原创篇章短练，非完整真题',
    passage: [
      'A teaching team at a fictional university is considering a digital assistant that suggests revisions to student essays. The software can quickly flag repeated words and unclear sentences. Supporters argue that immediate feedback could leave teachers more time to discuss ideas. The team decides to run a pilot before making the assistant part of every writing course.',
      'During the pilot, students submit an early draft and then revise it with access to the assistant. Their final drafts contain fewer language errors. This is encouraging, but the teachers notice a difficulty in interpreting the result: students have also received classroom instruction and spent additional time revising. The improvement cannot automatically be attributed to the software alone.',
      'To learn more, the team asks students to explain several revisions in their own words. Some can identify why a change makes an argument clearer; others have accepted suggestions without understanding them. A polished final draft may therefore conceal differences in what students have actually learned. The teachers propose a short writing task without the assistant as an additional measure.',
      'The team does not conclude that the tool is useless. Instead, it treats speed, final accuracy and independent understanding as separate outcomes. A larger trial could compare different forms of feedback while keeping revision time similar. For now, the responsible decision is to investigate which uses support learning, rather than to present a single improved score as a complete answer.',
    ],
    questions: [
      {
        id: 'cet6-reading-1-q1', prompt: 'Why can the improvement in final drafts not be credited entirely to the assistant?',
        options: ['The software was unavailable during revision.', 'The students had already mastered every writing skill.', 'Instruction and extra revision time may also have contributed.', 'Teachers refused to examine the final drafts.'], answer: 2,
        evidence: 'This is encouraging, but the teachers notice a difficulty in interpreting the result: students have also received classroom instruction and spent additional time revising.',
        explanation: '第二段给出同时发生的教学与额外修改时间，说明存在其他可能影响结果的因素。不能从“用了工具后变好”直接推出改善完全由工具造成。', skill: '证据与归因',
      },
      {
        id: 'cet6-reading-1-q2', prompt: 'What would the proposed task without the assistant help assess?',
        options: ['How quickly the software can process a whole class.', 'How many suggestions a teacher prefers to receive.', 'Whether students enjoy using a new interface.', 'Whether students can apply understanding independently.'], answer: 3,
        evidence: 'A polished final draft may therefore conceal differences in what students have actually learned.',
        explanation: '第三段先区分理解修改理由与机械接受建议，再提出无辅助任务。新增任务是补查独立运用能力，不是再次测软件速度或界面偏好。', skill: '措施目的',
      },
      {
        id: 'cet6-reading-1-q3', prompt: 'Which position best represents the teaching team’s conclusion?',
        options: ['The assistant should be judged through several distinct learning outcomes.', 'A lower error count proves that the assistant should be compulsory.', 'Digital feedback should be rejected whenever a trial has limitations.', 'Student explanations are less useful than a single overall score.'], answer: 0,
        evidence: 'Instead, it treats speed, final accuracy and independent understanding as separate outcomes.',
        explanation: '末段将速度、准确性和独立理解分开评价，支持继续研究而非立即推广或全面否定。正确项保留多指标和有限结论。', skill: '立场与概括',
      },
    ],
  },
  {
    id: 'cet6-reading-2', title: '线上预约方便了谁', examType: 'cet6', kind: 'reading', minutes: 10,
    focus: '观点比较、隐含条件与公共服务评价；原创篇章短练，非完整真题',
    passage: [
      'A community centre plans to replace its telephone booking system with an online form. The proposal promises shorter queues and fewer repeated calls. Staff can see why this would be attractive: many working residents prefer to arrange appointments after office hours. Yet convenience for frequent users is only one way to judge a public service.',
      'At a consultation meeting, several residents describe less visible barriers. One shares a phone with relatives and cannot always receive a confirmation message. Another can use the website but struggles with its small text. These concerns do not establish that online booking should be abandoned. They show that possessing a device is not the same as being able to complete a task reliably.',
      'The centre therefore proposes an online option alongside a limited telephone service. It also plans to simplify the form and test it with people who have different access needs. Maintaining two channels will require staff time. However, judging efficiency only by the number of calls removed could overlook the cost of missed appointments and repeated attempts.',
      'The pilot will record completion rates as well as waiting times, and ask unsuccessful users where they became stuck. A shorter average wait would be welcome, but it would not settle every question about access. The centre aims to reduce unnecessary work without shifting an unreasonable burden onto residents. That requires examining who benefits from a change and who may need another route.',
    ],
    questions: [
      {
        id: 'cet6-reading-2-q1', prompt: 'What do the residents’ examples suggest about online access?',
        options: ['All residents prefer making telephone calls.', 'Owning or sharing a device does not guarantee successful use.', 'Small text is the only barrier worth addressing.', 'Confirmation messages make every appointment more reliable.'], answer: 1,
        evidence: 'They show that possessing a device is not the same as being able to complete a task reliably.',
        explanation: '设备可用不等于能顺利完成任务，原文分别举了共用手机和文字太小两类障碍。all、only 和 every 都把例子扩大成了绝对结论。', skill: '论点定位',
      },
      {
        id: 'cet6-reading-2-q2', prompt: 'Why might counting only the calls removed give an incomplete picture of efficiency?',
        options: ['It would ignore appointments made during office hours.', 'It would make both booking channels equally expensive.', 'It could miss extra effort caused by unsuccessful booking attempts.', 'It would prevent the centre from measuring waiting times.'], answer: 2,
        evidence: 'However, judging efficiency only by the number of calls removed could overlook the cost of missed appointments and repeated attempts.',
        explanation: '第三段把工作人员省下的来电与居民失约、重复尝试的成本放在一起考虑。重点是评价范围太窄，而非不能测等待时间。', skill: '推断与评价',
      },
      {
        id: 'cet6-reading-2-q3', prompt: 'Which title best captures the central concern of the passage?',
        options: ['Why Telephone Booking Must Never Change', 'How to Replace Staff with a Single Website', 'The Fastest Form Is Always the Fairest', 'Improving Booking While Keeping Access in View'], answer: 3,
        evidence: 'That requires examining who benefits from a change and who may need another route.',
        explanation: '全文接受线上服务的便利，也关注不同居民能否使用，主旨是改善效率时兼顾可达性。不是反对一切改变，也没有把最快等同于最公平。', skill: '主旨判断',
      },
    ],
  },
  {
    id: 'cet6-writing-1', title: '同伴反馈怎样促进真正的修改', examType: 'cet6', kind: 'writing', minutes: 20,
    focus: '提出有条件的论点、解释机制与回应局限；原创写作短练',
    prompt: 'A university is considering regular peer feedback sessions in writing courses. Write an essay discussing when peer feedback can improve students’ writing and what support is needed to make it useful. Present a clear position, explain at least one benefit, and address one limitation. Write 150–200 words.',
    wordRange: [150, 200],
    outline: ['提出有条件的立场：同伴反馈有用，但需要明确的任务设计。', '解释读者视角如何暴露论证缺口，并用情境支撑。', '回应反馈质量不稳定的问题，提出培训和修改说明。'],
    reference: 'Peer feedback can strengthen university writing courses, provided that students are taught to respond as careful readers rather than informal graders. Its value lies not simply in receiving more comments, but in discovering how an argument is understood by someone else.\n\nFor example, a writer may consider a paragraph perfectly clear until a classmate asks how its evidence supports the main claim. That question can reveal a missing step in the reasoning. Reviewing another person’s draft may also help students recognise similar weaknesses in their own work.\n\nHowever, peer comments are not automatically reliable. Students may focus on minor language errors or offer advice that reflects personal preference. Teachers should therefore provide a short set of questions about purpose, evidence and organisation, and demonstrate constructive responses. Writers should explain which suggestions they adopt and why, instead of being required to accept every comment.\n\nWith this support, peer feedback can become practice in making informed revisions. It should complement teacher guidance, while leaving students responsible for the decisions that shape their final text.',
    notes: ['provided that 交代条件；不是把同伴反馈一概写成有效或无效。', '建议让作者说明采纳理由，回应“机械接受”这一局限。参考不唯一，不提供自动考试分数。'],
    checklist: ['我的立场是否包含明确条件，并用例子解释反馈如何起作用？', '我是否回应一项真实局限，并提出与之对应的支持措施？', '结论是否保留必要限定，且各段围绕同一个论点推进？'],
  },
  {
    id: 'cet6-writing-2', title: '校园环保行动应如何评价', examType: 'cet6', kind: 'writing', minutes: 20,
    focus: '评价标准、成本权衡与谨慎结论；原创写作短练',
    prompt: 'Your university wants to evaluate a campaign encouraging reusable cups. Write an essay explaining how its success should be assessed. Discuss why participation numbers alone may be insufficient, propose another useful measure, and consider one practical limitation. Write 150–200 words.',
    wordRange: [150, 200],
    outline: ['区分报名热情与实际习惯改变，提出综合评价立场。', '给出能观察的指标，如一段时间内一次性杯用量。', '讨论成本或执行条件，避免仅凭一个数字下结论。'],
    reference: 'A campus campaign for reusable cups should be assessed by changes in daily practice, not only by the number of students who sign up. Registration can indicate initial interest, but it does not show whether a cup is used repeatedly or left in a cupboard.\n\nOne useful measure would be the number of disposable cups distributed by participating cafes over a comparable period. This could be considered alongside feedback about washing facilities and the convenience of carrying a reusable cup. Together, these observations would offer a clearer picture of both behaviour and the conditions supporting it.\n\nNevertheless, measurement has limits. A fall in disposable cup use might reflect fewer customers rather than a successful campaign. Comparing similar weeks and recording customer numbers would help the university interpret the result more carefully. The effort required to collect information should also remain proportionate to the project.\n\nThe aim is to learn which arrangements make a lasting change easier. A modest pilot with transparent measures can support that aim better than an impressive registration total presented without context.',
    notes: ['参考用替代解释检验因果判断：杯子减少也可能是顾客减少。', 'proportionate to the project 说明评估成本也要适度；参考是一种论证路径，不是唯一答案或评分结果。'],
    checklist: ['我是否解释报名人数为什么不足，并给出可观察的补充指标？', '我是否考虑至少一种替代解释或执行限制？', '我的结论是否与证据强度相称，且没有虚构统计数字？'],
  },
  {
    id: 'cet6-translation-1', title: '让文化体验兼顾参与与理解', examType: 'cet6', kind: 'translation', minutes: 15,
    focus: '条件与让步、抽象目的及长句拆分；原创汉译英短练',
    prompt: '将下段关于社区文化体验项目的中文译成英文。注意“参与便利不等于理解文化”的限定，以及试行、收集意见、再调整的先后关系。英文词数仅为本题参考范围。',
    sourceText: '社区计划开设一系列茶文化体验课，让居民在学习基本礼仪的同时，交流各自的生活经验。课程将安排在周末，并提供简单清楚的报名方式，方便不同年龄的人参加。不过，组织者认为，降低参与门槛并不意味着只追求热闹。教师除了演示泡茶步骤，还会解释待客方式与尊重他人的关系。试行结束后，社区将收集参与者和志愿者的意见，了解时间安排是否合适、内容是否容易理解，再决定如何调整课程，而不会仅凭报名人数判断项目是否成功。',
    wordRange: [110, 180],
    outline: ['交代项目目的与便利参与的具体措施。', '用转折表达低门槛与文化理解之间的关系。', '保留试行后的反馈指标与不唯报名人数的评价原则。'],
    reference: 'The community plans to offer a series of workshops on tea culture, allowing residents to share their life experiences while learning basic etiquette. The workshops will take place at weekends, with a clear and simple registration process to make participation easier for people of different ages. However, the organisers believe that lowering barriers to participation should not mean merely creating a lively event. Besides demonstrating how to prepare tea, teachers will explain the connection between welcoming guests and showing respect for others. After the pilot, the community will gather feedback from participants and volunteers to find out whether the schedule is suitable and the content is easy to understand. It will then decide how to adjust the workshops, rather than judging the project’s success solely by registration numbers.',
    notes: ['译法不唯一。茶文化体验课可译为 workshops on tea culture，重点是活动性质与文化理解。', '参考将较长中文拆成多句，同时保留 while、however、besides、after 和 rather than 承载的逻辑；词数范围不是官方要求。'],
    checklist: ['我是否完整译出文化交流目的、周末安排与报名便利？', '我是否保留“低门槛不等于只求热闹”以及礼仪解释的转折？', '我是否译清先试行收集反馈再调整，而非只看报名人数？'],
  },
  {
    id: 'cet6-translation-2', title: '公共信息怎样照顾不同读者', examType: 'cet6', kind: 'translation', minutes: 15,
    focus: '公共服务、递进与评价标准；原创汉译英短练',
    prompt: '将下段关于公园服务信息的中文译成英文。注意信息渠道的并列、更新方式及对服务效果的审慎评价。英文词数仅为参考译文范围，并非官方要求。',
    sourceText: '一座城市公园准备改进服务信息，帮助初次到访的游客更容易找到入口、卫生间和无障碍路线。管理人员计划在主要路口设置清晰的指示牌，同时保留纸质地图，供不习惯使用手机的人领取。线上地图也会及时更新，但不会成为获取信息的唯一渠道。项目试行期间，工作人员将记录游客经常询问的问题，并邀请不同年龄和行动能力的人提出建议。评估效果时，管理方不仅关注问路次数是否减少，还会了解游客能否独立到达目的地，以避免把少有人求助误认为服务已经完善。',
    wordRange: [110, 180],
    outline: ['先交代信息服务目的与三个具体地点。', '并列纸质、指示牌、线上地图，并保留非唯一渠道的限定。', '准确表达试行收集意见和避免误判的评价逻辑。'],
    reference: 'A city park plans to improve its visitor information so that first-time visitors can find entrances, toilets and accessible routes more easily. Clear signs will be placed at major junctions, while paper maps will remain available for people who are not accustomed to using smartphones. The online map will also be updated promptly, but it will not be the only source of information. During the pilot, staff will record questions that visitors frequently ask and invite suggestions from people of different ages and levels of mobility. In evaluating the results, the management will consider not only whether requests for directions have decreased, but also whether visitors can reach their destinations independently. This will help avoid mistaking fewer requests for help for evidence that the service is already adequate.',
    notes: ['译法不唯一。accessible routes 表达无障碍路线，levels of mobility 体现行动能力差异。', 'fewer requests 只说明求助减少，不自动证明服务完善；参考保留这一限制，不添加原文没有的成效或统计。词数范围仅作本题参考。'],
    checklist: ['我是否保留三个目标地点及纸质、指示牌、线上三种信息方式？', '我是否译出不同年龄和行动能力的人都参与反馈？', '我是否准确表达两个评价维度，避免把“求助少”译成“服务已完善”？'],
  },
]
