document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. 코어 유틸 함수 ---
    window.showToast = function(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg; toast.classList.add('show');
        setTimeout(() => { toast.classList.remove('show'); }, 2500);
    }

    // --- 2. 파이어베이스 초기화 ---
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY_HERE",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };
    
    let auth, db;
    try {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch(e) {
        console.error("Firebase Init Error:", e);
    }
    
    let currentUser = null;
    let unsubscribeSnapshot = null;

    // --- 3. 로컬 캐시 초기화 ---
    let storesData = [];
    let ordersData = [];
    let customItems = ["식품관리라벨(+@)", "계란보관함", "쎄니크로", "손소독/손세정제", "업소용 클린매트", "식기 덮개용 천", "이격판", "외부화보관함", "산가측정지"];
    let customVendors = ["본사", "자체구매"];
    
    let backup = null;
    try { backup = localStorage.getItem('kadarosDataBackup'); } catch(e) {}
    if(backup) {
        try { 
            const parsed = JSON.parse(backup);
            if (Array.isArray(parsed)) { storesData = parsed; } 
            else { 
                storesData = parsed.stores || []; 
                ordersData = parsed.orders || []; 
                if(parsed.customItems) customItems = parsed.customItems;
                if(parsed.customVendors) customVendors = parsed.customVendors;
            }
        } catch(e){}
    }

    let adminPw = '0000';
    try { adminPw = localStorage.getItem('kadarosAdminPw') || '0000'; } catch(e) {}

    // --- 4. 전역 함수 바인딩 (이벤트 리스너용) ---
    window.updateAllUIs = function() {
        try { updateDashboard(); } catch(e) {}
        try { window.renderCalendar(); } catch(e) {}
        try { renderConsultingList(); } catch(e) {}
        try { window.renderBlockMap(); } catch(e) {}
        try { if(document.getElementById('store-manage').classList.contains('active')) renderStoreList(); } catch(e){}
        try { if(document.getElementById('settings-stock').classList.contains('active')) window.renderStockTable(); } catch(e){}
        try { if(document.getElementById('settings-orders').classList.contains('active')) window.renderOrderList(); } catch(e){}
        try { if(document.getElementById('settings-manage-items').classList.contains('active')) window.renderManageItemsList(); } catch(e){}
        try { if(document.getElementById('settings-manage-vendors').classList.contains('active')) window.renderManageVendorsList(); } catch(e){}
        try { window.updateDropdowns(); } catch(e){}
    }

    function toggleAppUI(isLoggedIn) {
        const appContainer = document.getElementById('app-container');
        const loginOverlay = document.getElementById('login-overlay');
        
        if(isLoggedIn) {
            loginOverlay.style.opacity = '0';
            setTimeout(() => {
                loginOverlay.style.display = 'none';
                appContainer.style.display = 'flex';
                void appContainer.offsetWidth; 
                appContainer.style.opacity = '1';
                window.updateAllUIs(); 
            }, 400);
        } else {
            appContainer.style.opacity = '0';
            setTimeout(() => {
                appContainer.style.display = 'none';
                loginOverlay.style.display = 'flex';
                void loginOverlay.offsetWidth;
                loginOverlay.style.opacity = '1';
            }, 400);
        }
    }

    // --- 5. 서버 연동 로직 ---
    function initRealtimeSync() {
        if (!currentUser || !db) return;
        if(unsubscribeSnapshot) unsubscribeSnapshot();

        unsubscribeSnapshot = db.collection('users').doc(currentUser.uid).onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                storesData = data.stores || [];
                ordersData = data.orders || [];
                if(data.customItems) customItems = data.customItems;
                if(data.customVendors) customVendors = data.customVendors;
                try { localStorage.setItem('kadarosDataBackup', JSON.stringify({stores: storesData, orders: ordersData, customItems: customItems, customVendors: customVendors})); } catch(e){}
            } else {
                storesData = []; ordersData = [];
            }
            window.updateAllUIs();
        }, (error) => {
            console.error("Realtime sync error:", error);
        });
    }

    window.manualRefresh = async function() {
        if(!currentUser || !db) return window.showToast("로그인이 필요합니다.");
        const icon = document.getElementById('refresh-icon');
        icon.parentElement.classList.add('spinning'); 
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get({source: 'server'});
            if(doc.exists) {
                const data = doc.data();
                storesData = data.stores || [];
                ordersData = data.orders || [];
                if(data.customItems) customItems = data.customItems;
                if(data.customVendors) customVendors = data.customVendors;
                try { localStorage.setItem('kadarosDataBackup', JSON.stringify({stores: storesData, orders: ordersData, customItems: customItems, customVendors: customVendors})); } catch(e){}
            } else {
                storesData = []; ordersData = [];
            }
            window.updateAllUIs();
            window.showToast("데이터를 성공적으로 최신화했습니다.");
        } catch(e) {
            console.error("새로고침 에러", e);
            window.showToast("새로고침 실패. 네트워크를 확인해주세요.");
        } finally {
            setTimeout(() => { icon.parentElement.classList.remove('spinning'); }, 500); 
        }
    };

    async function saveData() { 
        if(!currentUser || !db) return;
        try {
            await db.collection('users').doc(currentUser.uid).set({ stores: storesData, orders: ordersData, customItems: customItems, customVendors: customVendors });
        } catch(e) {
            console.error("저장 실패", e);
            window.showToast("서버 저장에 실패했습니다.");
        }
    }
    
    if (auth) {
        auth.onAuthStateChanged(user => {
            if(user) {
                currentUser = user; toggleAppUI(true); initRealtimeSync();
            } else {
                currentUser = null;
                if(unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
                toggleAppUI(false);
            }
        });
    }

    window.handleLogin = async function() {
        try {
            const email = document.getElementById('login-email').value.trim();
            const pw = document.getElementById('login-pw').value;
            const remember = document.getElementById('login-remember').checked;

            if(!email || !pw) return window.showToast("이메일과 비밀번호를 모두 입력해주세요.");
            if(!auth) return window.showToast("서버 초기화에 실패했습니다. 키를 확인하세요.");
            
            window.showToast("로그인 중...");
            let pStr = remember ? 'local' : 'session';
            try { await auth.setPersistence(pStr); } catch(e) { console.warn("Persistence Error:", e); }
            await auth.signInWithEmailAndPassword(email, pw);
            // 로그인 성공은 onAuthStateChanged가 반응함
        } catch(error) {
            console.error("Login Error:", error);
            if(error.code === 'auth/invalid-email') window.showToast("이메일 형식이 올바르지 않습니다.");
            else if(error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') window.showToast("이메일 또는 비밀번호가 틀렸습니다.");
            else window.showToast("로그인 실패: " + error.message);
        }
    };

    window.handleLogout = function() {
        if(!auth) return;
        auth.signOut().then(() => {
            window.showToast("로그아웃 되었습니다.");
            storesData = []; ordersData = [];
            document.getElementById('login-pw').value = '';
        });
    };

    // --- 6. 각종 데이터 세팅 ---
    const regionData = {
        "서울특별시": ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
        "경기도": ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "광명시", "김포시", "군포시", "광주시", "이천시", "양주시", "오산시", "구리시", "안성시", "포천시", "의왕시", "하남시", "여주시", "양평군", "동두천시", "과천시", "가평군", "연천군"]
    };

    const hygieneChecklistMaster = [
        {
            cat: "기본분야 (미준수 시 부적합)", items: [
                {id:"b1", txt:"종사자 건강검진 일자 준수", max:0, type:"basic"}, {id:"b2", txt:"위생모 및 마스크 착용", max:0, type:"basic"}, {id:"b3", txt:"영업자 위생교육 이수", max:0, type:"basic"},
                {id:"b4", txt:"표시사항 있는 식재료 사용", max:0, type:"basic"}, {id:"b5", txt:"소비기한 경과 원료 금지", max:0, type:"basic"}, {id:"b6", txt:"음식물 재사용 금지", max:0, type:"basic"},
                {id:"b7", txt:"식품용 적합 기구/용기 사용", max:0, type:"basic"}, {id:"b8", txt:"튀김용 유지 산가 3.0 이하", max:0, type:"basic"}
            ]
        },
        {
            cat: "객석 및 객실 (34점)", items: [
                {id:"g1_1", txt:"천장 및 조명 청결 (파손, 누수 없음) [2점]", max:2, type:"general"}, {id:"g1_2", txt:"벽면 파손, 끈적임 없이 청결 [2점]", max:2, type:"general"}, {id:"g1_3", txt:"바닥 파손, 끈적임 없이 청결 [2점]", max:2, type:"general"},
                {id:"g1_4", txt:"창문, 커튼 파손 및 이물 없이 청결 [3점]", max:3, type:"general"}, {id:"g1_5", txt:"환기시설(선풍기 등) 정상작동 [1점]", max:1, type:"general"}, {id:"g1_6", txt:"환기시설 내부 먼지 없이 청결 [3점]", max:3, type:"general"},
                {id:"g1_7", txt:"방충·방서 서식 흔적 없음 [2점]", max:2, type:"general"}, {id:"g1_8", txt:"방충·방서 설비 정상작동 및 청결 [3점]", max:3, type:"general"}, {id:"g1_9", txt:"식탁, 의자 장식품 청결 [2점]", max:2, type:"general"},
                {id:"g1_10", txt:"냅킨통, 소스통 청결 [2점]", max:2, type:"general"}, {id:"g1_11", txt:"객석 쓰레기통 덮개 및 청결 [1점]", max:1, type:"general"}, {id:"g1_12", txt:"수저통 덮개 구비 및 청결 [2점]", max:2, type:"general"},
                {id:"g1_13", txt:"손님용 앞치마 청결 [2점]", max:2, type:"general"}, {id:"g1_14", txt:"음용수 시설 정기 점검/정비 [1점]", max:1, type:"general"}, {id:"g1_15", txt:"정수기 추출구 이물 없이 청결 [1점]", max:1, type:"general"},
                {id:"g1_16", txt:"지하수 잔류염소/소독 입증 [2점]", max:2, type:"general"}, {id:"g1_17", txt:"객석용/주방용 행주 구분 보관 [1점]", max:1, type:"general"}, {id:"g1_18", txt:"행주 청결유지 [1점]", max:1, type:"general"},
                {id:"g1_19", txt:"키오스크, 샐러드바 덮개/청결 [1점]", max:1, type:"general"}
            ]
        },
        {
            cat: "조리장 관리 (72점)", items: [
                {id:"g2_1", txt:"천장 빗물/파손 없음 [1점]", max:1, type:"general"}, {id:"g2_2", txt:"천장/조명 거미줄, 곰팡이 없음 [2점]", max:2, type:"general"}, {id:"g2_3", txt:"벽/창문 파손 및 방충망 정상 [2점]", max:2, type:"general"},
                {id:"g2_4", txt:"벽/창문 곰팡이/빗물 없음 [3점]", max:3, type:"general"}, {id:"g2_5", txt:"환풍/후드 정상작동 및 청결 [4점]", max:4, type:"general"}, {id:"g2_6", txt:"배수시설 덮개 및 바닥 마름 [4점]", max:4, type:"general"},
                {id:"g2_7", txt:"식재료 바닥 이격 보관 [1점]", max:1, type:"general"}, {id:"g2_8", txt:"식재료 보관공간 청결/정돈 [3점]", max:3, type:"general"}, {id:"g2_9", txt:"기기/도구 소독방법 실시 [2점]", max:2, type:"general"},
                {id:"g2_10", txt:"도구 교차오염 방지 보관 [2점]", max:2, type:"general"}, {id:"g2_11", txt:"칼/도마 용도별 구분 사용 [2점]", max:2, type:"general"}, {id:"g2_12", txt:"기기/식기 청결유지 [4점]", max:4, type:"general"},
                {id:"g2_13", txt:"냉장·냉동고 청결 및 온도 [3점]", max:3, type:"general"}, {id:"g2_14", txt:"익힌음식 상단, 날음식 하단 보관 [2점]", max:2, type:"general"}, {id:"g2_15", txt:"외포장 제거 구분 보관 [2점]", max:2, type:"general"},
                {id:"g2_16", txt:"반조리 식품 밀폐 보관 [2점]", max:2, type:"general"}, {id:"g2_17", txt:"올바른 해동방법 준수 및 표시 [4점]", max:4, type:"general"}, {id:"g2_18", txt:"생채소 철저한 세척/소독 [2점]", max:2, type:"general"},
                {id:"g2_19", txt:"세척/소독제 규정적합 및 구분보관 [5점]", max:5, type:"general"}, {id:"g2_20", txt:"소분용기 청결/소비기한 [3점]", max:3, type:"general"}, {id:"g2_21", txt:"수족관 청결 관리 [2점]", max:2, type:"general"},
                {id:"g2_22", txt:"잔반/일반 쓰레기통 구분 및 청결 [4점]", max:4, type:"general"}, {id:"g2_23", txt:"손세척 시설 및 청결 [2점]", max:2, type:"general"}, {id:"g2_24", txt:"달걀/생선 등 온도 준수 보관 [5점]", max:5, type:"general"}
            ]
        },
        {
            cat: "종사자 및 화장실 관리 (12점)", items: [
                {id:"g3_1", txt:"위생교육 분기 1회 실시 [1점]", max:1, type:"general"}, {id:"g3_2", txt:"교육내용 주기적 확인 [2점]", max:2, type:"general"}, {id:"g3_3", txt:"두발/손톱 청결, 장신구 미착용 [1점]", max:1, type:"general"},
                {id:"g3_4", txt:"위생복/마스크 청결, 구분착용 [3점]", max:3, type:"general"}, {id:"g3_5", txt:"화장실 청결 및 환기 [2점]", max:2, type:"general"}, {id:"g3_6", txt:"손세척/건조 용품 구비 [3점]", max:3, type:"general"}
            ]
        },
        {
            cat: "공통분야 (가점)", items: [
                {id:"b_1", txt:"CCTV 주방 내부 실시간 공개 [2점]", max:2, type:"bonus"},
                {id:"b_2", txt:"식품관련 및 국가기관 자격증 소지자 [1점]", max:1, type:"bonus"},
                {id:"b_3", txt:"5년 이상 장기 근속자 [1점]", max:1, type:"bonus"},
                {id:"b_4", txt:"나트륨/당류 저감 메뉴 개발·판매 [1점]", max:1, type:"bonus"},
                {id:"b_5", txt:"알레르기, 영양성분 표시 등 [1점]", max:1, type:"bonus"},
                {id:"b_6", txt:"위생등급 유효기간 연장 이력 [3점]", max:3, type:"bonus"},
                {id:"b_7", txt:"모범음식점 등 지정업소 [2점]", max:2, type:"bonus"}
            ]
        }
    ];

    // --- 7. 캐릭터 캔버스 물리엔진 모션 ---
    const canvas = document.getElementById('fx-canvas');
    const ctx = canvas.getContext('2d');
    function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const helperChar = document.getElementById('helper-char');
    const motions = ['motion-jump', 'motion-spin', 'motion-squish', 'motion-wiggle']; 
    const faces = ['face-happy', 'face-surprised', 'face-wink'];
    
    let isGolden = false; let isTransitioning = false; 
    let pressTimer = null; let explodeTimer = null; let isPressing = false; 
    let isInflating = false; let isPopped = false;
    let pressStartTime = 0; let rafId = null;

    function doClickAction() {
        if (!isGolden && Math.random() < 0.03) { 
            isTransitioning = true; isGolden = true; playMotionGraphicWipe(true); return; 
        }
        helperChar.classList.remove(...motions, ...faces, 'face-puff'); void helperChar.offsetWidth; 
        const rm = motions[Math.floor(Math.random() * motions.length)]; const rf = faces[Math.floor(Math.random() * faces.length)];
        helperChar.classList.add(rm, rf); setTimeout(() => { helperChar.classList.remove(rm, rf); }, 600);
    }

    function playMotionGraphicWipe(isToGolden) {
        canvas.style.display = 'block'; 
        let start = null; const duration = 2000;
        const particles = Array.from({length: 100}, () => ({ x: Math.random() * canvas.width, y: -Math.random()*canvas.height, size: Math.random() * 4 + 1.5, speedY: Math.random() * 15 + 10, speedX: Math.random() * 4 - 2, opacity: Math.random() * 0.8 + 0.2 }));

        function render(time) {
            if (!start) start = time; const elapsed = time - start; const progress = Math.min(elapsed / duration, 1);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let overlayAlpha = 0;
            if (progress < 0.4) overlayAlpha = progress / 0.4;
            else if (progress < 0.6) { overlayAlpha = 1; if (!canvas.dataset.swapped) { toggleThemeDOM(isToGolden); canvas.dataset.swapped = 'true'; if(navigator.vibrate) {try{navigator.vibrate([100, 50, 100]);}catch(e){}} } }
            else overlayAlpha = 1 - ((progress - 0.6) / 0.4);

            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            if (isToGolden) { gradient.addColorStop(0, `rgba(255, 223, 0, ${overlayAlpha})`); gradient.addColorStop(1, `rgba(212, 175, 55, ${overlayAlpha})`); }
            else { gradient.addColorStop(0, `rgba(3, 110, 184, ${overlayAlpha})`); gradient.addColorStop(1, `rgba(0, 80, 150, ${overlayAlpha})`); }
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => { p.y += p.speedY * (progress * 2); p.x += Math.sin(progress * 10 + p.speedX) * 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = isToGolden ? `rgba(255, 255, 255, ${p.opacity})` : `rgba(150, 200, 255, ${p.opacity})`; ctx.shadowBlur = 10; ctx.shadowColor = isToGolden ? "#FFF" : "#00FFFF"; ctx.fill(); });

            if (progress < 1) requestAnimationFrame(render);
            else { canvas.style.display = 'none'; canvas.dataset.swapped = ''; isTransitioning = false; }
        }
        requestAnimationFrame(render);
    }

    function toggleThemeDOM(toGolden) {
        const greeting = document.getElementById('main-greeting');
        if (toGolden) { document.body.classList.add('golden-theme'); helperChar.classList.add('golden'); greeting.innerHTML = "✨ 앗! 황금이 발견! ✨<br>오늘 하루 대박나실 거예요!"; }
        else { document.body.classList.remove('golden-theme'); helperChar.classList.remove('golden'); greeting.innerHTML = "카다로스 업무 도우미입니다.<br>무엇을 도와드릴까요?"; }
    }

    function triggerLiquidPop() {
        isPopped = true;
        isInflating = false;
        
        helperChar.style.transition = 'none';
        helperChar.style.opacity = '0';
        helperChar.style.transform = 'scale(0)';
        helperChar.classList.remove('face-puff');

        canvas.style.display = 'block';

        const rect = helperChar.parentElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let pList = Array.from({length: 70}, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 45 + 15; 
            let pColor = isGolden ? 
                `rgba(${200 + Math.random()*55}, ${150 + Math.random()*50}, 30, 1)` : 
                `rgba(${10 + Math.random()*20}, ${90 + Math.random()*40}, ${170 + Math.random()*50}, 1)`;
            return { x: centerX, y: centerY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 14 + 4, friction: 0.80 + Math.random() * 0.08, color: pColor };
        });

        let pStartTime = performance.now();

        function renderPop(time) {
            const elapsed = time - pStartTime;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let allGathered = true;

            pList.forEach(p => {
                if (elapsed < 800) {
                    p.x += p.vx; p.y += p.vy; p.vx *= p.friction; p.vy *= p.friction; allGathered = false;
                } else if (elapsed >= 800 && elapsed < 1800) {
                    const dx = centerX - p.x; const dy = centerY - p.y; const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 8) {
                        allGathered = false;
                        const gatherForce = Math.pow((elapsed - 800) / 1000, 2) * 0.4; 
                        p.vx += dx * gatherForce; p.vy += dy * gatherForce; p.vx *= 0.88; p.vy *= 0.88;
                        p.x += p.vx; p.y += p.vy;
                    } else { p.x = centerX; p.y = centerY; p.vx = 0; p.vy = 0; }
                }

                const speedSq = p.vx*p.vx + p.vy*p.vy;
                const stretch = Math.max(1, speedSq * 0.015);
                const angle = Math.atan2(p.vy, p.vx);

                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.beginPath();
                ctx.ellipse(0, 0, p.size * stretch, p.size, 0, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.fill(); ctx.restore();
            });

            if (elapsed < 1800 || !allGathered) { rafId = requestAnimationFrame(renderPop); } 
            else {
                canvas.style.display = 'none';
                helperChar.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s';
                helperChar.style.opacity = '1';
                helperChar.style.transform = 'scale(1)';
                if(navigator.vibrate) {try{navigator.vibrate(40);}catch(e){}}
                setTimeout(() => { isPopped = false; helperChar.style.transition = 'transform 0.4s ease'; helperChar.style.transform = ''; }, 600);
            }
        }
        if(navigator.vibrate) {try{navigator.vibrate([80, 40, 80]);}catch(e){}} 
        rafId = requestAnimationFrame(renderPop);
    }

    const startPress = (e) => { 
        if (isTransitioning || isPopped) return; 
        isPressing = true; pressStartTime = Date.now();
        pressTimer = setTimeout(() => { 
            if(!isPressing) return;
            isInflating = true; helperChar.classList.add('face-puff');
            helperChar.style.transition = 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            helperChar.style.transform = 'scale(2.5)';
            explodeTimer = setTimeout(() => { if(isInflating) triggerLiquidPop(); }, 1500); 
        }, 500); 
    };

    const cancelPress = (e) => { 
        if(!isPressing) return;
        isPressing = false; clearTimeout(pressTimer); clearTimeout(explodeTimer);
        const holdDuration = Date.now() - pressStartTime;
        if(holdDuration < 500 && !isPopped && !isTransitioning) { doClickAction(); } 
        else if (isInflating && !isPopped) {
            isInflating = false; helperChar.classList.remove('face-puff');
            helperChar.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            helperChar.style.transform = 'scale(1)';
        }
    };

    if(helperChar) {
        helperChar.addEventListener('mousedown', startPress); helperChar.addEventListener('touchstart', startPress, {passive: true});
        helperChar.addEventListener('mouseup', cancelPress); helperChar.addEventListener('mouseleave', cancelPress);
        helperChar.addEventListener('touchend', cancelPress); helperChar.addEventListener('touchcancel', cancelPress);
    }

    // --- 8. UI 이벤트 리스너 바인딩 ---
    const bindClick = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener('click', fn); };

    bindClick('btn-close-pw-modal', window.closePwModal);
    bindClick('btn-confirm-pw-action', window.confirmPwAction);
    bindClick('btn-close-change-pw', window.closeChangePwModal);
    bindClick('btn-confirm-change-pw', window.confirmChangePw);
    bindClick('btn-close-year-modal', window.closeYearModal);
    bindClick('btn-apply-year', window.applyYear);
    bindClick('btn-close-memo', window.closeMemo);
    bindClick('btn-save-memo', window.saveMemo);
    bindClick('btn-close-items', window.closeItemsModal);
    bindClick('btn-save-items', window.saveItems);
    bindClick('btn-close-docs', window.closeDocModal);
    bindClick('btn-save-docs', window.saveDocs);
    bindClick('btn-close-map', window.closeMapOverlay);
    bindClick('btn-back-checklist', window.closeChecklist);
    bindClick('btn-open-doc', window.openDocModal);
    bindClick('btn-open-items', window.openItemsModal);
    bindClick('btn-open-memo', window.openMemo);
    bindClick('btn-save-checklist', window.saveChecklist);
    bindClick('btn-back-to-manage', window.goBackToStoreManage);
    bindClick('btn-cancel-sel', window.cancelSelectionMode);
    bindClick('btn-delete-sel', () => window.openDeletePwModal('store'));
    bindClick('btn-cancel-order-sel', window.cancelOrderSelectionMode);
    bindClick('btn-delete-order-sel', () => window.openDeletePwModal('order'));

    // --- 9. 네비게이션 로직 ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active')); this.classList.add('active');
            const targetId = this.getAttribute('data-target');
            document.querySelectorAll('.view-section').forEach(section => { section.classList.remove('active'); });
            document.getElementById(targetId).classList.add('active');
            
            if(targetId === 'view-calendar') { setTimeout(() => { try{ window.renderCalendar(); }catch(err){console.error(err);} }, 50); }
            if(targetId === 'view-store') { window.openStoreView('main'); try{ window.renderBlockMap(); }catch(err){} }
            if(targetId === 'view-consulting') { try{ renderConsultingList(); }catch(err){} }
            if(targetId === 'view-settings') { window.openSettingsSub('settings-main'); }
        });
    });

    document.querySelectorAll('[data-target-view]').forEach(el => {
        el.addEventListener('click', () => {
            const view = el.getAttribute('data-target-view');
            const filter = el.getAttribute('data-filter');
            window.openStoreView(view, filter ? filter.split(',') : null);
        });
    });

    document.querySelectorAll('[data-target-sub]').forEach(el => {
        el.addEventListener('click', () => {
            window.openSettingsSub(el.getAttribute('data-target-sub'));
        });
    });

    // --- 10. 홈 화면 기능 ---
    const searchInput = document.getElementById('home-search-input');
    if(searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.trim().toLowerCase();
            const dash = document.getElementById('dashboard'); const dashHeader = document.getElementById('home-dash-header'); const resWrap = document.getElementById('home-search-results');
            if (query) {
                dash.style.display = 'none'; dashHeader.parentElement.style.display = 'none'; resWrap.style.display = 'flex'; resWrap.innerHTML = '';
                const statusPriority = { '진행중': 1, '보류': 2, '불합격': 3, '합격': 4 };
                const matched = storesData.filter(s => s.name.toLowerCase().includes(query)).sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
                if (matched.length === 0) resWrap.innerHTML = '<div class="store-empty">검색 결과가 없습니다.</div>';
                else {
                    matched.forEach(store => {
                        const card = document.createElement('div'); card.className = `store-card ${getStatusClass(store.status)}`;
                        card.onclick = () => { document.querySelector('.nav-item[data-target="view-store"]').click(); window.openStoreView('manage', [store.status]); window.openEditStore(store.id); };
                        card.innerHTML = `<h3>${store.name} <span class="status-badge">${store.status}</span></h3><div class="store-info-line"><span>지역</span> <strong>${store.region}</strong></div>`;
                        resWrap.appendChild(card);
                    });
                }
            } else { dash.style.display = 'grid'; dashHeader.parentElement.style.display = 'flex'; resWrap.style.display = 'none'; }
        });
    }

    function updateDashboard() {
        let inProgressCount = 0; let passedCount = 0; let failedCount = 0; let thisWeekCount = 0; let nextWeekCount = 0;
        const now = new Date(); now.setHours(0,0,0,0);
        const endOfWeek = new Date(now); const diff = now.getDay() === 0 ? 0 : 7 - now.getDay(); endOfWeek.setDate(now.getDate() + diff); endOfWeek.setHours(23,59,59,999);
        const nextWeekStart = new Date(endOfWeek); nextWeekStart.setDate(nextWeekStart.getDate() + 1); nextWeekStart.setHours(0,0,0,0);
        const nextWeekEnd = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekStart.getDate() + 6); nextWeekEnd.setHours(23,59,59,999);

        storesData.forEach(store => {
            if (store.status === '진행중' || store.status === '보류') inProgressCount++;
            if (store.status === '합격') passedCount++;
            if (store.status === '불합격') failedCount++;
            
            [store.consult1, store.consult2].filter(d => d).forEach(dStr => {
                const d = new Date(dStr);
                if(d >= now && d <= endOfWeek) thisWeekCount++;
                if(d >= nextWeekStart && d <= nextWeekEnd) nextWeekCount++;
            });
        });

        const completedCount = passedCount + failedCount;
        const successRate = completedCount === 0 ? 0 : Math.round((passedCount / completedCount) * 100);

        const e1 = document.getElementById('dash-inprogress'); if(e1) e1.innerHTML = `<b>${inProgressCount}</b>개의 매장을 진행중이에요.`;
        const e2 = document.getElementById('dash-completed'); if(e2) e2.innerHTML = `<b>${completedCount}</b>개의 매장을<br>완료했어요.`;
        const e3 = document.getElementById('dash-success'); if(e3) e3.innerHTML = `컨설팅 성공률은<br><b>${successRate}</b>%에요.`;
        const e4 = document.getElementById('dash-this-week'); if(e4) e4.innerHTML = `<b>${thisWeekCount}</b>번의 방문<br>일정이 있어요!`;
        const e5 = document.getElementById('dash-next-week'); if(e5) e5.innerHTML = `<b>${nextWeekCount}</b>번의 방문<br>일정이 있어요!`;
    }

    // --- 11. 캘린더 기능 ---
    let currentDate = new Date(); let selectedDateStr = null;
    function getSchedulesForDate(dateStr) {
        let results = [];
        storesData.forEach(store => {
            if(store.applyDate === dateStr) results.push({ name: store.name, type: "신청일", typeClass: "type-apply" });
            if(store.consult1 === dateStr) results.push({ name: store.name, type: "1차 컨설팅", typeClass: "" });
            if(store.consult2 === dateStr) results.push({ name: store.name, type: "2차 컨설팅", typeClass: "" });
            if(store.inspect === dateStr) results.push({ name: store.name, type: "심사일", typeClass: "type-inspect" });
        }); return results;
    }

    function generateCalendarDOM() {
        const year = currentDate.getFullYear(); const month = currentDate.getMonth(); const today = new Date();
        const yEl = document.getElementById('cal-year'); if(yEl) yEl.textContent = year;
        const mEl = document.getElementById('cal-month'); if(mEl) mEl.textContent = (month + 1) + '월';
        const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
        let html = '';
        for (let i = 0; i < firstDay; i++) { html += `<div class="calendar-cell empty"></div>`; }
        for (let i = 1; i <= daysInMonth; i++) {
            const cellDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`; let cls = 'calendar-cell';
            if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) { cls += ' today'; if(!selectedDateStr) window.selectDate(cellDateStr); }
            if (cellDateStr === selectedDateStr) cls += ' selected';
            let markers = ''; const schedules = getSchedulesForDate(cellDateStr);
            if (schedules.length > 0) {
                markers += '<div class="marker-wrap">';
                schedules.slice(0, 3).forEach(sch => { let mcls = 'marker'; if(sch.type === '심사일') mcls += ' marker-red'; if(sch.type === '신청일') mcls += ' marker-yellow'; markers += `<div class="${mcls}"></div>`; });
                markers += '</div>';
            }
            html += `<div class="${cls}" onclick="window.selectDate('${cellDateStr}')">${i}${markers}</div>`;
        } return html;
    }

    window.renderCalendar = function() {
        const grid = document.getElementById('calendar-grid'); 
        if(!grid) return;
        grid.innerHTML = generateCalendarDOM();
    }

    window.selectDate = function(dateStr) {
        selectedDateStr = dateStr; const dateObj = new Date(dateStr); 
        const sTitle = document.getElementById('selected-date-title');
        if(sTitle) sTitle.textContent = `${dateObj.getMonth()+1}월 ${dateObj.getDate()}일 일정`;
        const listEl = document.getElementById('schedule-list'); 
        if(!listEl) return;
        listEl.innerHTML = ''; const schedules = getSchedulesForDate(dateStr);
        if (schedules.length > 0) schedules.forEach(item => { listEl.innerHTML += `<div class="schedule-box ${item.typeClass}"><span class="sch-name">${item.name}</span><span class="sch-type">${item.type}</span></div>`; });
        else listEl.innerHTML = '<div class="schedule-empty">등록된 일정이 없습니다.</div>';
        window.renderCalendar();
    }

    const calWrap = document.getElementById('calendar-wrapper'); let isTwoFing = false; let sX = 0; let cX = 0;
    if(calWrap) {
        calWrap.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { isTwoFing = true; sX = (e.touches[0].clientX + e.touches[1].clientX) / 2; e.preventDefault(); } }, {passive: false});
        calWrap.addEventListener('touchmove', (e) => { if (isTwoFing && e.touches.length === 2) { cX = (e.touches[0].clientX + e.touches[1].clientX) / 2; e.preventDefault(); } }, {passive: false});
        calWrap.addEventListener('touchend', (e) => { 
            if (isTwoFing) { 
                let dX = sX - cX; 
                if (Math.abs(dX) > 40 && cX !== 0) { 
                    const grid = document.getElementById('calendar-grid');
                    const outClass = dX > 0 ? 'slide-left-out' : 'slide-right-out'; const inClass = dX > 0 ? 'slide-right-in' : 'slide-left-in';
                    grid.classList.add(outClass);
                    setTimeout(() => {
                        if (dX > 0) currentDate.setMonth(currentDate.getMonth() + 1); else currentDate.setMonth(currentDate.getMonth() - 1);
                        grid.classList.remove(outClass); grid.innerHTML = generateCalendarDOM(); grid.classList.add(inClass);
                        setTimeout(() => { grid.classList.remove(inClass); window.renderCalendar(); }, 50);
                    }, 200);
                } isTwoFing = false; sX = 0; cX = 0; 
            } 
        });
    }

    window.openYearModal = function() { document.getElementById('year-input').value = currentDate.getFullYear(); document.getElementById('year-modal').style.display = 'flex'; void document.getElementById('year-modal').offsetWidth; document.getElementById('year-modal').classList.add('show'); };
    window.closeYearModal = function() { document.getElementById('year-modal').classList.remove('show'); setTimeout(()=> {document.getElementById('year-modal').style.display = 'none';}, 200); };
    window.applyYear = function() { const newYear = document.getElementById('year-input').value; if (newYear && !isNaN(newYear)) { currentDate.setFullYear(parseInt(newYear)); window.renderCalendar(); window.closeYearModal(); } };

    // --- 12. 매장 관리 ---
    let currentListFilters = []; let isSelectionMode = false; let selectedStoreIds = new Set();
    window.goBackToStoreManage = function() { window.openStoreView('manage', currentListFilters && currentListFilters.length ? currentListFilters : ['진행중']); };

    window.openStoreView = function(viewName, filters = null) {
        document.querySelectorAll('.store-sub-view').forEach(s => s.classList.remove('active')); window.cancelSelectionMode();
        if (filters) currentListFilters = filters; 
        if (viewName === 'main') { document.getElementById('store-main-view').classList.add('active'); window.renderBlockMap(); }
        if (viewName === 'register') document.getElementById('store-register').classList.add('active');
        if (viewName === 'manage') {
            if(!currentListFilters || currentListFilters.length === 0) currentListFilters = ['진행중', '보류', '합격', '불합격'];
            document.getElementById('store-manage').classList.add('active');
            let titleStr = "매장 목록";
            if(currentListFilters.includes('진행중') && currentListFilters.length===1) titleStr = "진행 매장 관리";
            if(currentListFilters.includes('보류') && currentListFilters.length===1) titleStr = "보류 매장 관리";
            if(currentListFilters.includes('합격')) titleStr = "완료 매장 관리";
            document.getElementById('store-list-title').textContent = titleStr;
            renderStoreList();
        }
    };

    const provSelect = document.getElementById('region-province'); const citySelect = document.getElementById('region-city');
    if(provSelect) {
        provSelect.addEventListener('change', function() {
            const selected = this.value; citySelect.innerHTML = '<option value="" disabled selected>시/군/구</option>';
            if(regionData[selected]) { regionData[selected].forEach(city => { const option = document.createElement('option'); option.value = city; option.textContent = city; citySelect.appendChild(option); }); citySelect.disabled = false; } else citySelect.disabled = true;
        });
    }

    const storeForm = document.getElementById('new-store-form');
    if(storeForm) {
        storeForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const price = Number(document.getElementById('store-price').value) || 0;
            const deposit = Number(document.getElementById('store-deposit').value) || 0;
            const newStore = {
                id: Date.now(), name: document.getElementById('store-name').value, status: '진행중', 
                region: `${document.getElementById('region-province').value} ${document.getElementById('region-city').value}`,
                priceTotal: price, priceDeposit: deposit, vat: document.querySelector('input[name="vat"]:checked').value,
                applyDate: document.getElementById('date-apply').value, consult1: "", consult2: "", inspect: "",
                checklistData: null, memo: "", providedItems: {}, documents: {}
            };
            storesData.unshift(newStore); saveData(); window.updateAllUIs(); 
            window.showToast("저장되었습니다.");
            this.reset(); citySelect.innerHTML = '<option value="" disabled selected>시/군/구</option>'; citySelect.disabled = true;
            window.openStoreView('manage', ['진행중']); 
        });
    }

    function getStatusClass(status) {
        if(status === '합격') return 'status-pass'; if(status === '불합격') return 'status-fail'; if(status === '보류') return 'status-pending'; return 'status-progress';
    }

    window.activateSelectionMode = function(firstId) { isSelectionMode = true; selectedStoreIds.add(firstId); renderStoreList(); window.updateSelectionBar(); };
    window.cancelSelectionMode = function() { isSelectionMode = false; selectedStoreIds.clear(); document.getElementById('selection-bar').classList.remove('active'); renderStoreList(); };
    window.updateSelectionBar = function() {
        const bar = document.getElementById('selection-bar');
        if(isSelectionMode) { bar.classList.add('active'); document.getElementById('selection-count').textContent = `${selectedStoreIds.size}개 선택됨`; } else bar.classList.remove('active');
    };

    // 공용 모달/삭제 연동
    let pwTargetAction = null; let deleteTargetId = null;

    window.checkPwAndOpenAction = function(action, id = null) {
        pwTargetAction = action; deleteTargetId = id;
        document.getElementById('pw-modal-title').textContent = "관리자 비밀번호 입력";
        document.getElementById('del-pw-input').value = '';
        document.getElementById('pw-modal').style.display = 'flex';
        void document.getElementById('pw-modal').offsetWidth;
        document.getElementById('pw-modal').classList.add('show');
    };
    
    window.openDeletePwModal = function(type) {
        if(type === 'store' && selectedStoreIds.size === 0) return;
        if(type === 'order' && selectedOrderIds.size === 0) return;
        window.checkPwAndOpenAction('delete_' + type);
    };

    window.closePwModal = function() {
        document.getElementById('pw-modal').classList.remove('show');
        setTimeout(() => document.getElementById('pw-modal').style.display = 'none', 200);
    };

    window.confirmPwAction = function() {
        const inputPw = document.getElementById('del-pw-input').value;
        if(inputPw === adminPw) {
            window.closePwModal();
            if(pwTargetAction === 'delete_store') { storesData = storesData.filter(s => !selectedStoreIds.has(s.id)); window.cancelSelectionMode(); saveData(); window.updateAllUIs(); window.showToast("삭제되었습니다."); } 
            else if(pwTargetAction === 'delete_order') { ordersData = ordersData.filter(o => !selectedOrderIds.has(o.id)); window.cancelOrderSelectionMode(); saveData(); window.updateAllUIs(); window.showToast("삭제되었습니다."); }
            else if(pwTargetAction === 'delete_item') { customItems = customItems.filter((_, idx) => idx !== deleteTargetId); saveData(); window.updateAllUIs(); window.showToast("삭제되었습니다."); }
            else if(pwTargetAction === 'delete_vendor') { customVendors = customVendors.filter((_, idx) => idx !== deleteTargetId); saveData(); window.updateAllUIs(); window.showToast("삭제되었습니다."); }
            else if(pwTargetAction === 'open_manage_items') { window.openSettingsSub('settings-manage-items'); }
            else if(pwTargetAction === 'open_manage_vendors') { window.openSettingsSub('settings-manage-vendors'); }
        } else { window.showToast("비밀번호가 일치하지 않습니다."); }
    };

    function renderStoreList() {
        const container = document.getElementById('store-list-container');
        if(!container) return;
        container.innerHTML = ''; container.classList.toggle('selection-mode-active', isSelectionMode);

        const statusPriority = { '진행중': 1, '보류': 2, '불합격': 3, '합격': 4 };
        const filtered = storesData.filter(s => currentListFilters.includes(s.status)).sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);

        if(filtered.length === 0) { container.innerHTML = '<div class="store-empty">해당되는 매장이 없습니다.</div>'; return; }
        
        filtered.forEach(store => {
            const card = document.createElement('div'); card.className = `store-card ${getStatusClass(store.status)}`;
            if (selectedStoreIds.has(store.id)) card.classList.add('is-selected');
            
            const balance = (store.priceTotal || 0) - (store.priceDeposit || 0);
            let balanceHtml = balance > 0 ? `<div class="store-info-line"><span>미수금</span> <strong style="color:var(--red-color)">${balance.toLocaleString()}원</strong></div>` : `<div class="store-info-line"><span>미수금</span> <strong style="color:var(--brand-color)">결제 완료</strong></div>`;

            card.innerHTML = `<h3>${store.name} <span class="status-badge">${store.status}</span></h3><div class="store-info-line"><span>지역</span> <strong>${store.region}</strong></div><div class="store-info-line"><span>신청일</span> <strong>${store.applyDate || '-'}</strong></div>${balanceHtml}<div class="select-indicator"></div>`;

            let tPressTimer; let tIsPressing = false; let startY = 0;
            const cStartPress = (e) => { if(isSelectionMode) return; tIsPressing = true; startY = e.touches ? e.touches[0].clientY : e.clientY; tPressTimer = setTimeout(() => { tIsPressing = false; window.activateSelectionMode(store.id); if(navigator.vibrate){ try{ navigator.vibrate(50); }catch(err){} } }, 1500); };
            const cCancelPress = () => { clearTimeout(tPressTimer); tIsPressing = false; };
            const movePress = (e) => { const currentY = e.touches ? e.touches[0].clientY : e.clientY; if(Math.abs(currentY - startY) > 10) cCancelPress(); };

            card.addEventListener('mousedown', cStartPress); card.addEventListener('touchstart', cStartPress, {passive:true});
            card.addEventListener('mousemove', movePress); card.addEventListener('touchmove', movePress, {passive:true});
            card.addEventListener('mouseup', cCancelPress); card.addEventListener('mouseleave', cCancelPress); card.addEventListener('touchend', cCancelPress);

            card.addEventListener('click', () => {
                if (isSelectionMode) { if (selectedStoreIds.has(store.id)) selectedStoreIds.delete(store.id); else selectedStoreIds.add(store.id); renderStoreList(); window.updateSelectionBar(); }
                else window.openEditStore(store.id);
            }); container.appendChild(card);
        });
    }

    window.openEditStore = function(id) {
        const store = storesData.find(s => s.id === id); if(!store) return;
        document.getElementById('edit-store-id').value = store.id; 
        document.getElementById('edit-store-status').value = store.status; 
        document.getElementById('edit-store-name').value = store.name; 
        document.getElementById('edit-store-price').value = store.priceTotal || 0;
        document.getElementById('edit-store-deposit').value = store.priceDeposit || 0;
        document.getElementById('edit-date-apply').value = store.applyDate; 
        document.getElementById('edit-date-consult1').value = store.consult1; 
        document.getElementById('edit-date-consult2').value = store.consult2; 
        document.getElementById('edit-date-inspect').value = store.inspect;
        
        const viewBtn = document.getElementById('btn-view-checklist');
        if(store.checklistData || store.memo || (store.providedItems && Object.keys(store.providedItems).length > 0) || (store.documents && Object.keys(store.documents).length > 0)) {
            viewBtn.style.display = 'block';
            viewBtn.onclick = () => { document.querySelector('.nav-item[data-target="view-consulting"]').click(); window.openChecklist(store.id); };
        } else { viewBtn.style.display = 'none'; }

        document.querySelectorAll('.store-sub-view').forEach(s => s.classList.remove('active')); document.getElementById('store-edit').classList.add('active');
    };

    const editForm = document.getElementById('edit-store-form');
    if(editForm) {
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const store = storesData.find(s => s.id === parseInt(document.getElementById('edit-store-id').value));
            if(store) {
                store.status = document.getElementById('edit-store-status').value; 
                store.name = document.getElementById('edit-store-name').value; 
                store.priceTotal = Number(document.getElementById('edit-store-price').value) || 0;
                store.priceDeposit = Number(document.getElementById('edit-store-deposit').value) || 0;
                store.applyDate = document.getElementById('edit-date-apply').value; 
                store.consult1 = document.getElementById('edit-date-consult1').value; 
                store.consult2 = document.getElementById('edit-date-consult2').value; 
                store.inspect = document.getElementById('edit-date-inspect').value;
                saveData(); window.updateAllUIs(); window.showToast("저장되었습니다."); window.goBackToStoreManage(); 
            }
        });
    }

    window.openChangePwModal = function() {
        document.getElementById('current-pw-input').value = ''; document.getElementById('new-pw-input').value = '';
        document.getElementById('change-pw-modal').style.display = 'flex'; void document.getElementById('change-pw-modal').offsetWidth; document.getElementById('change-pw-modal').classList.add('show');
    };
    window.closeChangePwModal = function() { document.getElementById('change-pw-modal').classList.remove('show'); setTimeout(() => document.getElementById('change-pw-modal').style.display = 'none', 200); };
    window.confirmChangePw = function() {
        const current = document.getElementById('current-pw-input').value; const newPw = document.getElementById('new-pw-input').value;
        if(current === adminPw) {
            if(newPw.length < 4) { window.showToast("새 비밀번호는 4자리 이상 입력해주세요."); return; }
            adminPw = newPw; localStorage.setItem('kadarosAdminPw', adminPw); window.closeChangePwModal(); window.showToast("비밀번호가 성공적으로 변경되었습니다.");
        } else { window.showToast("현재 비밀번호가 틀립니다."); }
    };

    window.switchMapTab = function(regionKey) {
        document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active')); document.querySelector(`.map-tab[data-target="${regionKey}"]`).classList.add('active');
        document.getElementById('block-map-seoul').style.display = regionKey === 'seoul' ? 'grid' : 'none'; document.getElementById('block-map-gyeonggi').style.display = regionKey === 'gyeonggi' ? 'grid' : 'none';
    };

    window.renderBlockMap = function() {
        const drawBlocks = (targetId, dataArr) => {
            const grid = document.getElementById(targetId);
            if(!grid) return;
            grid.innerHTML = '';
            dataArr.forEach(cityName => {
                const count = storesData.filter(s => s.region.includes(cityName)).length;
                const block = document.createElement('div'); block.className = `map-block ${count > 0 ? (count > 2 ? 'has-store-dense' : 'has-store') : ''}`; block.innerHTML = cityName + (count > 0 ? `<div class="badge">${count}</div>` : '');
                block.onclick = () => {
                    document.querySelectorAll('.map-block').forEach(b => b.classList.remove('popped')); block.classList.add('popped'); document.getElementById('dimmer').classList.add('active');
                    document.getElementById('ts-title').textContent = cityName + " 현황"; const list = document.getElementById('ts-content'); list.innerHTML = '';
                    const statusPriority = { '진행중': 1, '보류': 2, '불합격': 3, '합격': 4 };
                    const matched = storesData.filter(s => s.region.includes(cityName)).sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
                    if(matched.length === 0) list.innerHTML = '<div class="store-empty" style="margin-top:20px;">등록된 매장이 없습니다.</div>';
                    else {
                        matched.forEach(store => {
                            const card = document.createElement('div'); card.className = `store-card ${getStatusClass(store.status)}`; card.style.marginBottom = '10px'; card.onclick = () => { window.closeMapOverlay(); window.openStoreView('manage', [store.status]); window.openEditStore(store.id); };
                            
                            const bal = (store.priceTotal || 0) - (store.priceDeposit || 0);
                            let balHtml = bal > 0 ? `<strong style="color:var(--red-color)">미수금 ${bal.toLocaleString()}원</strong>` : `<strong style="color:var(--brand-color)">결제 완료</strong>`;
                            
                            card.innerHTML = `<h3>${store.name} <span class="status-badge">${store.status}</span></h3><div class="store-info-line"><span>결제현황</span> ${balHtml}</div>`; list.appendChild(card);
                        });
                    }
                    document.getElementById('top-sheet').classList.add('active');
                }; grid.appendChild(block);
            });
        };
        drawBlocks('block-map-seoul', regionData["서울특별시"]); drawBlocks('block-map-gyeonggi', regionData["경기도"]);
    }
    window.closeMapOverlay = function() { document.querySelectorAll('.map-block').forEach(b => b.classList.remove('popped')); document.getElementById('dimmer').classList.remove('active'); document.getElementById('top-sheet').classList.remove('active'); };

    // --- 13. 컨설팅 탭 및 평가 ---
    function renderConsultingList() {
        document.getElementById('consult-check-view').style.display = 'none'; document.getElementById('consult-list-view').style.display = 'flex';
        const list = document.getElementById('consult-store-list'); 
        if(!list) return;
        list.innerHTML = '';
        const inProgress = storesData.filter(s => s.status === '진행중' || s.status === '보류');
        if(inProgress.length === 0) { list.innerHTML = '<div class="store-empty">진행중인 매장이 없습니다.</div>'; return; }
        inProgress.forEach(store => {
            const card = document.createElement('div'); card.className = `store-card ${getStatusClass(store.status)}`; card.onclick = () => window.openChecklist(store.id);
            card.innerHTML = `<h3>${store.name} <span class="status-badge">${store.status}</span></h3><div class="store-info-line"><span>신청일</span> <strong>${store.applyDate || '-'}</strong></div>`; list.appendChild(card);
        });
    }

    window.openChecklist = function(storeId) {
        currentChecklistStoreId = storeId;
        const store = storesData.find(s => s.id === storeId); if(!store) return;
        currentChecklistData = store.checklistData || {};
        document.getElementById('memo-textarea').value = store.memo || '';
        document.getElementById('check-store-title').textContent = `${store.name} 평가표`;
        document.getElementById('consult-list-view').style.display = 'none'; document.getElementById('consult-check-view').style.display = 'flex';
        
        const accordion = document.getElementById('checklist-accordion'); accordion.innerHTML = '';
        hygieneChecklistMaster.forEach((cat, index) => {
            const itemDiv = document.createElement('div'); itemDiv.className = 'accordion-item';
            let html = `<div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('active'); this.classList.toggle('active');">
                            ${cat.cat} <svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                        </div><div class="accordion-content ${index===0 ? 'active' : ''}">`; 
            cat.items.forEach(itm => {
                const savedVal = currentChecklistData[itm.id];
                let isChecked = false; let isNA = (savedVal === 'NA');
                if (!isNA) {
                    if (itm.type === 'basic') isChecked = (savedVal === 'O');
                    else isChecked = (savedVal !== undefined && parseInt(savedVal) === itm.max); 
                }

                let naHtml = '';
                if (itm.type === 'general') { naHtml = `<button class="btn-na ${isNA ? 'active' : ''}" onclick="window.toggleNA(this)">비해당</button>`; }

                let formattedTxt = itm.txt.replace(/(\[[0-9]+점\])/g, '<span style="color:var(--gray-400); font-size:13px; font-weight:500; margin-left:2px;">$1</span>');

                html += `
                    <div class="check-item-row" data-na="${isNA}">
                        <div class="chk-info"><span class="chk-text">${formattedTxt}</span></div>
                        <div class="chk-actions">
                            ${naHtml}
                            <label>
                                <input type="checkbox" class="hygiene-check score-input" data-id="${itm.id}" data-type="${itm.type}" value="${itm.max}" ${isChecked ? 'checked' : ''} ${isNA ? 'disabled' : ''} onchange="window.calcTotal()">
                                <div class="custom-chk"></div>
                            </label>
                        </div>
                    </div>
                `;
            });
            html += `</div>`; itemDiv.innerHTML = html; accordion.appendChild(itemDiv);
        });
        window.calcTotal();
    };

    window.closeChecklist = function() { renderConsultingList(); };

    window.toggleNA = function(btn) {
        const row = btn.closest('.check-item-row'); const chk = row.querySelector('.hygiene-check'); const isNA = row.dataset.na === 'true';
        if (isNA) { row.dataset.na = 'false'; btn.classList.remove('active'); chk.disabled = false; } else { row.dataset.na = 'true'; btn.classList.add('active'); chk.disabled = true; chk.checked = false; }
        window.calcTotal();
    };

    window.calcTotal = function() {
        let sumGenPossible = 0; let sumGenObtained = 0; let sumBonus = 0;

        document.querySelectorAll('.check-item-row').forEach(row => {
            const chk = row.querySelector('.hygiene-check');
            const isNA = row.dataset.na === 'true'; const isChecked = chk.checked;
            const type = chk.dataset.type; const max = parseInt(chk.value) || 0;

            if (type === 'general') { if (!isNA) { sumGenPossible += max; if (isChecked) sumGenObtained += max; } } 
            else if (type === 'bonus') { if (isChecked) sumBonus += max; }
        });

        let score1 = 0;
        if (sumGenPossible > 0) score1 = Math.round((sumGenObtained / sumGenPossible) * 100);
        
        let total = score1 + sumBonus;
        const scoreEl = document.getElementById('check-total-score');
        scoreEl.textContent = total + "점";
        document.getElementById('check-breakdown').textContent = `(환산 ${score1}점 + 가점 ${sumBonus}점)`;

        if(total < 85) scoreEl.style.color = 'var(--red-color)';
        else scoreEl.style.color = 'var(--brand-color)';
    };

    window.saveChecklist = function() {
        const store = storesData.find(s => s.id === currentChecklistStoreId); if(!store) return;
        const newData = {};
        document.querySelectorAll('.check-item-row').forEach(row => {
            const chk = row.querySelector('.score-input'); const isNA = row.dataset.na === 'true';
            if(isNA) newData[chk.dataset.id] = 'NA';
            else if(chk.dataset.type === 'basic') newData[chk.dataset.id] = chk.checked ? 'O' : 'X';
            else newData[chk.dataset.id] = chk.checked ? chk.value : '0';
        });
        store.checklistData = newData; store.memo = document.getElementById('memo-textarea').value;
        saveData(); window.showToast("저장되었습니다."); window.closeChecklist();
    };

    window.openMemo = function() { document.getElementById('memo-modal').classList.add('active'); };
    window.closeMemo = function() { document.getElementById('memo-modal').classList.remove('active'); };
    window.saveMemo = function() { 
        const store = storesData.find(s => s.id === currentChecklistStoreId);
        if(store) { store.memo = document.getElementById('memo-textarea').value; saveData(); }
        window.closeMemo(); window.showToast("저장되었습니다."); 
    };

    window.openItemsModal = function() {
        const store = storesData.find(s => s.id === currentChecklistStoreId); if(!store) return;
        const pItems = store.providedItems || {};
        
        const listContainer = document.getElementById('items-modal-list');
        listContainer.innerHTML = '';

        customItems.forEach(itemName => {
            const isChecked = pItems[itemName] && pItems[itemName] > 0;
            const qty = isChecked ? pItems[itemName] : '';
            const display = isChecked ? 'block' : 'none';

            listContainer.innerHTML += `
                <div class="item-chk-row-qty">
                    <span>${itemName}</span>
                    <input type="number" class="item-qty-input form-input" style="width:70px; padding:8px; margin-right:12px; text-align:center; display:${display};" min="1" placeholder="수량" value="${qty}">
                    <label style="display:flex; align-items:center; cursor:pointer;">
                        <input type="checkbox" class="hygiene-check item-chk" value="${itemName}" ${isChecked ? 'checked' : ''} onchange="window.toggleItemQty(this)">
                        <div class="custom-chk"></div>
                    </label>
                </div>
            `;
        });
        
        document.getElementById('items-modal').classList.add('active');
    };

    window.toggleItemQty = function(chk) {
        const row = chk.closest('.item-chk-row-qty');
        const qtyInput = row.querySelector('.item-qty-input');
        if(chk.checked) {
            qtyInput.style.display = 'block';
            if(!qtyInput.value) qtyInput.value = 1;
        } else {
            qtyInput.style.display = 'none';
            qtyInput.value = '';
        }
    };

    window.closeItemsModal = function() { document.getElementById('items-modal').classList.remove('active'); };
    
    window.saveItems = function() {
        const store = storesData.find(s => s.id === currentChecklistStoreId); if(!store) return;
        const pItems = {};
        document.querySelectorAll('.item-chk-row-qty').forEach(row => {
            const chk = row.querySelector('.item-chk');
            const qtyInput = row.querySelector('.item-qty-input');
            if(chk.checked && qtyInput.value) {
                const qty = parseInt(qtyInput.value) || 0;
                if(qty > 0) pItems[chk.value] = qty;
            }
        });
        store.providedItems = pItems;
        saveData(); window.closeItemsModal(); window.showToast("저장되었습니다.");
    };

    window.openDocModal = function() {
        const store = storesData.find(s => s.id === currentChecklistStoreId); if(!store) return;
        const docs = store.documents || {};
        document.querySelectorAll('.doc-chk').forEach(chk => { chk.checked = !!docs[chk.value]; });
        document.getElementById('doc-modal').classList.add('active');
    };
    window.closeDocModal = function() { document.getElementById('doc-modal').classList.remove('active'); };
    window.saveDocs = function() {
        const store = storesData.find(s => s.id === currentChecklistStoreId); if(!store) return;
        const docs = {};
        document.querySelectorAll('.doc-chk').forEach(chk => { docs[chk.value] = chk.checked; });
        store.documents = docs;
        saveData(); window.closeDocModal(); window.showToast("저장되었습니다.");
    };

    // --- 14. 설정/재고 관리 로직 ---
    window.updateDropdowns = function() {
        const itemSel = document.getElementById('order-item-sel');
        const vendorSel = document.getElementById('order-vendor-sel');
        if(itemSel) {
            itemSel.innerHTML = '';
            customItems.forEach(item => { const opt = document.createElement('option'); opt.value = item; opt.textContent = item; itemSel.appendChild(opt); });
        }
        if(vendorSel) {
            vendorSel.innerHTML = '';
            customVendors.forEach(vendor => { const opt = document.createElement('option'); opt.value = vendor; opt.textContent = vendor; vendorSel.appendChild(opt); });
        }
    };

    window.renderStockTable = function() {
        const tbody = document.getElementById('stock-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        customItems.forEach(itemName => {
            let totalOrdered = 0;
            ordersData.forEach(order => { if(order.itemName === itemName) totalOrdered += order.qty; });
            
            let totalProvided = 0;
            storesData.forEach(store => {
                if(store.providedItems && store.providedItems[itemName]) { totalProvided += store.providedItems[itemName]; }
            });
            
            let currentStock = totalOrdered - totalProvided;
            if(currentStock < 0) currentStock = 0;

            let isRed = false;
            if (itemName === '식품관리라벨(+@)' && currentStock <= 200) isRed = true;
            else if (itemName !== '식품관리라벨(+@)' && currentStock <= 2) isRed = true;
            
            tbody.innerHTML += `
                <tr>
                    <td style="text-align:left; padding-left:16px;">${itemName}</td>
                    <td style="font-weight:800; color:${isRed ? 'var(--red-color)' : 'var(--brand-color)'}; font-size:16px;">${currentStock} 개</td>
                </tr>
            `;
        });
    };

    window.renderManageItemsList = function() {
        const container = document.getElementById('manage-items-list');
        if(!container) return;
        container.innerHTML = '';
        customItems.forEach((item, idx) => {
            container.innerHTML += `
                <div class="list-item-card">
                    <span>${item}</span>
                    <button class="btn-sm-del" onclick="window.checkPwAndOpenAction('delete_item', ${idx})">삭제</button>
                </div>
            `;
        });
    };

    window.addCustomItem = function() {
        const input = document.getElementById('new-custom-item-input');
        const val = input.value.trim();
        if(!val) return window.showToast("품목명을 입력하세요.");
        if(customItems.includes(val)) return window.showToast("이미 존재하는 품목입니다.");
        customItems.push(val); saveData(); window.updateAllUIs(); input.value = ''; window.showToast("추가되었습니다.");
    };

    window.renderManageVendorsList = function() {
        const container = document.getElementById('manage-vendors-list');
        if(!container) return;
        container.innerHTML = '';
        customVendors.forEach((vendor, idx) => {
            container.innerHTML += `
                <div class="list-item-card">
                    <span>${vendor}</span>
                    <button class="btn-sm-del" onclick="window.checkPwAndOpenAction('delete_vendor', ${idx})">삭제</button>
                </div>
            `;
        });
    };

    window.addCustomVendor = function() {
        const input = document.getElementById('new-custom-vendor-input');
        const val = input.value.trim();
        if(!val) return window.showToast("발주처를 입력하세요.");
        if(customVendors.includes(val)) return window.showToast("이미 존재하는 발주처입니다.");
        customVendors.push(val); saveData(); window.updateAllUIs(); input.value = ''; window.showToast("추가되었습니다.");
    };

    const orderForm = document.getElementById('new-order-form');
    if(orderForm) {
        orderForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newOrder = {
                id: Date.now(),
                itemName: document.getElementById('order-item-sel').value,
                vendorName: document.getElementById('order-vendor-sel').value,
                qty: parseInt(document.getElementById('order-qty-input').value),
                price: parseInt(document.getElementById('order-price-input').value),
                date: document.getElementById('order-date-input').value
            };
            ordersData.unshift(newOrder);
            saveData(); window.updateAllUIs(); 
            this.reset(); window.showToast("발주 기록이 추가되었습니다.");
        });
    }

    let selectedOrderIds = new Set();
    let isOrderSelectionMode = false;

    window.activateOrderSelectionMode = function(firstId) {
        isOrderSelectionMode = true; selectedOrderIds.add(firstId); 
        window.renderOrderList(); window.updateOrderSelectionBar(); 
    };
    window.cancelOrderSelectionMode = function() { 
        isOrderSelectionMode = false; selectedOrderIds.clear(); 
        document.getElementById('order-selection-bar').classList.remove('active'); 
        window.renderOrderList(); 
    };
    window.updateOrderSelectionBar = function() {
        const bar = document.getElementById('order-selection-bar');
        if(isOrderSelectionMode) { 
            bar.classList.add('active'); 
            document.getElementById('order-selection-count').textContent = `${selectedOrderIds.size}개 선택됨`; 
        } else { bar.classList.remove('active'); }
    };

    window.renderOrderList = function() {
        const container = document.getElementById('order-list-container');
        if(!container) return;
        container.innerHTML = '';
        container.classList.toggle('selection-mode-active', isOrderSelectionMode);

        if(ordersData.length === 0) {
            container.innerHTML = '<div class="store-empty" style="padding:30px;">발주 기록이 없습니다.</div>'; return;
        }

        const sorted = [...ordersData].sort((a,b) => new Date(b.date) - new Date(a.date));

        sorted.forEach(order => {
            const card = document.createElement('div'); 
            card.className = `store-card`;
            if (selectedOrderIds.has(order.id)) card.classList.add('is-selected');

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0; font-size:17px;"><span style="color:var(--gray-600); font-weight:600; font-size:13px; margin-right:4px;">[${order.vendorName}]</span>${order.itemName}</h3>
                    <span style="font-weight:800; color:var(--brand-color); font-size:16px;">${order.qty} 개</span>
                </div>
                <div class="store-info-line"><span>발주일</span> <strong>${order.date}</strong></div>
                <div class="store-info-line"><span>결제금액</span> <strong>${(order.price || 0).toLocaleString()}원</strong></div>
                <div class="select-indicator"></div>
            `;

            let tPressTimer; let tIsPressing = false; let startY = 0;
            const cStartPress = (e) => { if(isOrderSelectionMode) return; tIsPressing = true; startY = e.touches ? e.touches[0].clientY : e.clientY; tPressTimer = setTimeout(() => { tIsPressing = false; window.activateOrderSelectionMode(order.id); if(navigator.vibrate){ try{ navigator.vibrate(50); }catch(err){} } }, 1500); };
            const cCancelPress = () => { clearTimeout(tPressTimer); tIsPressing = false; };
            const movePress = (e) => { const currentY = e.touches ? e.touches[0].clientY : e.clientY; if(Math.abs(currentY - startY) > 10) cCancelPress(); };

            card.addEventListener('mousedown', cStartPress); card.addEventListener('touchstart', cStartPress, {passive:true});
            card.addEventListener('mousemove', movePress); card.addEventListener('touchmove', movePress, {passive:true});
            card.addEventListener('mouseup', cCancelPress); card.addEventListener('mouseleave', cCancelPress); card.addEventListener('touchend', cCancelPress);

            card.addEventListener('click', () => {
                if (isOrderSelectionMode) { 
                    if (selectedOrderIds.has(order.id)) selectedOrderIds.delete(order.id); 
                    else selectedOrderIds.add(order.id); 
                    window.renderOrderList(); window.updateOrderSelectionBar(); 
                }
            }); 
            container.appendChild(card);
        });
    };

    // --- 서비스 워커 ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(()=>{});
        });
    }
});
</script>