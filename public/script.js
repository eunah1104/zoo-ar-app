document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 요소 변수 선언 ---
    // 페이지 컨테이너
    const pages = {
        start: document.getElementById('start-page'),
        loading: document.getElementById('loading-page'),
        result: document.getElementById('result-page'),
        detail: document.getElementById('detail-page'),
        error: document.getElementById('error-page'),
    };

    // 입력 요소
    const imageUploadInput = document.getElementById('imageUploadInput');
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    
    // 결과 페이지 요소
    const resultImage = document.getElementById('resultImage');
    const resultAnimalName = document.getElementById('resultAnimalName');
    const resultProbability = document.getElementById('resultProbability');
    const resultAnimalSummary = document.getElementById('resultAnimalSummary'); // 새로 추가된 요약 p 태그

    // 상세 페이지 요소
    const detailAnimalName = document.getElementById('detailAnimalName');
    const detailHabitat = document.getElementById('detailHabitat');
    const detailDiet = document.getElementById('detailDiet');
    const detailSummary = document.getElementById('detailSummary');
    const detailFunFacts = document.getElementById('detailFunFacts');
    
    // 오류 페이지 요소
    const errorMessage = document.getElementById('errorMessage');

    // 카메라 모달 요소
    const cameraModal = document.getElementById('camera-modal');
    const cameraView = document.getElementById('camera-view');
    const cameraCanvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const cancelCameraBtn = document.getElementById('cancel-camera-btn');

    // 버튼 요소
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    const retryBtn = document.getElementById('retryBtn');
    const backToResultBtn = document.getElementById('backToResultBtn');
    const backToStartBtn = document.getElementById('backToStartBtn');
    const errorRetryBtn = document.getElementById('errorRetryBtn');

    // --- 상태 변수 ---
    let currentResultData = null; // 서버 결과를 저장할 변수
    let stream = null; // 카메라 스트림을 저장할 변수

    // --- 핵심 로직 함수 ---

    // 페이지를 전환하는 함수
    function showPage(pageName) {
        Object.values(pages).forEach(page => page.style.display = 'none');
        if (pages[pageName]) {
            pages[pageName].style.display = 'block';
        }
    }

    // 파일(이미지 업로드 또는 카메라 촬영)을 받아 서버로 보내고 결과를 처리하는 공통 함수
    async function handleImageFile(file) {
        if (!file) return;

        showPage('loading'); // 로딩 화면 표시

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                // 404 오류일 경우, 요청하신 메시지로 에러를 발생시킵니다.
                if (response.status === 404) {
                    throw new Error('일치하는 동물을 찾을 수 없어요🥲');
                }
                // 그 외 다른 서버 오류
                const errorResult = await response.json().catch(() => ({}));
                throw new Error(errorResult.message || `서버 오류가 발생했습니다 (${response.status})`);
            }
                        const result = await response.json();
            currentResultData = result; // 결과 저장
            displayResult(file, result); // 결과 표시 함수 호출
            showPage('result'); // 결과 페이지 표시

        } catch (err) {
            displayError(err.message);
        }
    }

    // --- 결과 및 상세 정보 표시 함수 ---

    function displayResult(file, data) {
        const topPrediction = data.predictions[0];
        resultImage.src = URL.createObjectURL(file); // 업로드/촬영된 이미지 미리보기
        resultAnimalName.textContent = data.animalInfo.name;
        resultProbability.textContent = (topPrediction.probability * 100).toFixed(1);
        resultAnimalSummary.textContent = data.animalInfo.summary;

    }
    
    function displayDetails() {
        if (!currentResultData) return;
        const info = currentResultData.animalInfo;
        detailAnimalName.textContent = info.name;
        detailHabitat.textContent = info.habitat;
        detailDiet.textContent = info.diet;
        detailSummary.textContent = info.summary;

        detailFunFacts.innerHTML = ''; // 기존 목록 초기화
        info.fun_facts.forEach(fact => {
            const li = document.createElement('li');
            li.textContent = fact;
            detailFunFacts.appendChild(li);
        });
    }

    function displayError(message) {
        errorMessage.textContent = message;
        showPage('error');
    }

    // --- 카메라 관련 함수 ---

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            cameraView.srcObject = stream;
            cameraModal.style.display = 'flex';
        } catch (err) {
            console.error("카메라를 열 수 없습니다:", err);
            displayError('카메라를 사용할 수 없거나 권한이 거부되었습니다.');
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        cameraModal.style.display = 'none';
        cameraView.srcObject = null;
    }

    // --- 이벤트 리스너 설정 ---

    imageUploadInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
    takePhotoBtn.addEventListener('click', startCamera);

    captureBtn.addEventListener('click', () => {
        cameraCanvas.width = cameraView.videoWidth;
        cameraCanvas.height = cameraView.videoHeight;
        cameraCanvas.getContext('2d').drawImage(cameraView, 0, 0);
        
        cameraCanvas.toBlob(blob => {
            const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            stopCamera();
            handleImageFile(file);
        }, 'image/jpeg');
    });

    cancelCameraBtn.addEventListener('click', stopCamera);
    
    viewDetailsBtn.addEventListener('click', () => { displayDetails(); showPage('detail'); });
    retryBtn.addEventListener('click', () => showPage('start'));
    errorRetryBtn.addEventListener('click', () => showPage('start'));
    backToResultBtn.addEventListener('click', () => showPage('result'));
    backToStartBtn.addEventListener('click', () => showPage('start'));

    // --- 초기화 ---
    showPage('start');
});