document.addEventListener('DOMContentLoaded', () => {

    // 1. 상태 관리 변수
    let currentResultData = null, stream = null, quizData = [], currentQuestionIndex = 0, score = 0, correctInARow = 0;

    // 2. DOM 요소 변수
    const pages = {
        start: document.getElementById('start-page'),
        loading: document.getElementById('loading-page'),
        result: document.getElementById('result-page'),
        detail: document.getElementById('detail-page'),
        error: document.getElementById('error-page'),
        quiz: document.getElementById('quiz-page'),
        ranking: document.getElementById('ranking-page') 
    };
    const imageUploadInput = document.getElementById('imageUploadInput');
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const resultImage = document.getElementById('resultImage');
    const rankingBtn = document.getElementById('rankingBtn');
    const rankingList = document.getElementById('ranking-list');
    const rankingBackBtn = document.getElementById('rankingBackBtn'); 
    const resultAnimalName = document.getElementById('resultAnimalName');
    const resultProbability = document.getElementById('resultProbability');
    const resultAnimalSummary = document.getElementById('resultAnimalSummary');
    const detailAnimalName = document.getElementById('detailAnimalName');
    const detailHabitat = document.getElementById('detailHabitat');
    const detailDiet = document.getElementById('detailDiet');
    const detailSummary = document.getElementById('detailSummary');
    const detailFunFacts = document.getElementById('detailFunFacts');
    const errorMessage = document.getElementById('errorMessage');
    const cameraModal = document.getElementById('camera-modal');
    const cameraView = document.getElementById('camera-view');
    const cameraCanvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const cancelCameraBtn = document.getElementById('cancel-camera-btn');
    const quizQuestionNumber = document.getElementById('quiz-question-number');
    const quizImage = document.getElementById('quiz-image');
    const quizQuestionText = document.getElementById('quiz-question-text');
    const quizOptions = document.getElementById('quiz-options');
    const quizFeedbackText = document.getElementById('quiz-feedback-text');
    const quizScore = document.getElementById('quiz-score');
    const quizNextBtn = document.getElementById('quiz-next-btn');
    const quizQuitBtn = document.getElementById('quiz-quit-btn');
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    const retryBtn = document.getElementById('retryBtn');
    const backToResultBtn = document.getElementById('backToResultBtn');
    const backToStartBtn = document.getElementById('backToStartBtn');
    const errorRetryBtn = document.getElementById('errorRetryBtn');
    
    // 3. 핵심 로직 함수
    function showPage(pageName) {
        Object.values(pages).forEach(page => {
            if(page) page.style.display = 'none';
        });
        if (pages[pageName]) pages[pageName].style.display = 'block';
    }

    async function handleImageFile(file) {
        if (!file) return;
        showPage('loading');
        const formData = new FormData();
        formData.append('image', file);
        try {
            const response = await fetch('/api/predict', { method: 'POST', body: formData });
            if (!response.ok) {
                if (response.status === 404) throw new Error('일치하는 동물을 찾을 수 없어요🥲');
                const errorResult = await response.json().catch(() => ({}));
                throw new Error(errorResult.message || `서버 오류가 발생했습니다 (${response.status})`);
            }
            const result = await response.json();
            currentResultData = result;
            displayResult(file, result);
            showPage('result');
        } catch (err) {
            displayError(err.message);
        }
    }

    function displayResult(file, data) {
        resultImage.src = URL.createObjectURL(file);
        resultAnimalName.textContent = data.animalInfo.name;
        resultProbability.textContent = (data.predictions[0].probability * 100).toFixed(1);
        resultAnimalSummary.textContent = data.animalInfo.summary;
    }
    
    function displayDetails() {
        if (!currentResultData) return;
        const info = currentResultData.animalInfo;
        detailAnimalName.textContent = info.name;
        detailHabitat.textContent = info.habitat;
        detailDiet.textContent = info.diet;
        detailSummary.textContent = info.summary;
        detailFunFacts.innerHTML = '';
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

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            cameraView.srcObject = stream;
            cameraModal.style.display = 'flex';
        } catch (err) {
            displayError('카메라를 사용할 수 없거나 권한이 거부되었습니다.');
        }
    }

    function stopCamera() {
        if (stream) stream.getTracks().forEach(track => track.stop());
        cameraModal.style.display = 'none';
        cameraView.srcObject = null;
    }

    // --- 퀴즈 관련 함수 정의 (누락되었던 부분) ---
    async function startQuiz() {
        showPage('loading');
        try {
            const response = await fetch('/api/quiz');
            if (!response.ok) throw new Error('퀴즈를 불러오지 못했습니다.');
            quizData = await response.json();
            currentQuestionIndex = 0;
            score = 0;
            correctInARow = 0;
            quizScore.textContent = score;
            displayQuizQuestion();
            showPage('quiz');
        } catch (err) {
            displayError(err.message);
        }
    }

    function displayQuizQuestion() {
        quizFeedbackText.textContent = '';
        quizNextBtn.style.display = 'none';
        quizOptions.innerHTML = '';
        if (currentQuestionIndex === 3 && correctInARow < 3) {
            endQuiz(`3문제 연속 정답에 실패하여 퀴즈가 종료됩니다.`);
            return;
        }
        const question = quizData[currentQuestionIndex];
        quizQuestionNumber.textContent = `문제 ${currentQuestionIndex + 1} / ${quizData.length}`;
        quizImage.src = question.image;
        quizQuestionText.textContent = question.question || `사진 속 동물의 이름은 무엇일까요?`;
        question.options.forEach(optionText => {
            const button = document.createElement('button');
            button.textContent = optionText;
            button.className = 'custom-button quiz-option';
            button.onclick = () => selectAnswer(optionText, button);
            quizOptions.appendChild(button);
        });
    }

    function selectAnswer(selectedOption, button) {
        quizOptions.querySelectorAll('button').forEach(btn => btn.disabled = true);
        const question = quizData[currentQuestionIndex];
        const isCorrect = selectedOption === question.answer;
        if (isCorrect) {
            score += 20;
            if (currentQuestionIndex < 3) correctInARow++;
            quizScore.textContent = score;
            quizFeedbackText.textContent = "정답입니다!🎉";
            quizFeedbackText.style.color = 'green';
            button.classList.add('correct');
        } else {
            correctInARow = 0;
            quizFeedbackText.textContent = `오답입니다!🥲 정답은 '${question.answer}' 입니다.`;
            quizFeedbackText.style.color = 'red';
            button.classList.add('incorrect');
            quizOptions.querySelectorAll('button').forEach(btn => {
                if (btn.textContent === question.answer) btn.classList.add('correct');
            });
        }
        const isLastQuestion = currentQuestionIndex >= quizData.length - 1;
        const bonusRoundFailed = currentQuestionIndex === 2 && correctInARow < 3;
        if (isLastQuestion || bonusRoundFailed) {
            setTimeout(() => endQuiz(bonusRoundFailed ? '3문제 연속 정답에 실패하여 퀴즈가 종료됩니다.' : ''), 2000);
        } else {
            quizNextBtn.style.display = 'inline-block';
        }
    }

    function endQuiz(customMessage = "") {
        const finalMessage = customMessage || `${quizData.length}개 문제 중 ${score / 20}개 문제를 맞추셨습니다!`;
        pages.quiz.innerHTML = `
            <h2>퀴즈 종료!</h2>
            <p class="final-score">${finalMessage}</p>
            <p id="countdown">3초 후 시작페이지로 돌아갑니다...</p>
        `;
        let count = 3;
        const countdownInterval = setInterval(() => {
            count--;
            const countdownElement = document.getElementById('countdown');
            if (count > 0) {
                if(countdownElement) countdownElement.textContent = `${count}초 후 시작페이지로 돌아갑니다...`;
            } else {
                clearInterval(countdownInterval);
                window.location.reload();
            }
        }, 1000);
    }

    // 랭킹 데이터를 가져와 화면에 표시하는 함수
    async function showRanking() {
        showPage('loading');
        try {
            const response = await fetch('/api/ranking');
            if (!response.ok) throw new Error('랭킹 정보를 불러올 수 없습니다.');
            
            const result = await response.json();
            const rankingData = result.data;
            
            rankingList.innerHTML = ''; // 기존 랭킹 목록 초기화
            
            if (rankingData.length === 0) {
                rankingList.innerHTML = '<li>아직 랭킹 데이터가 없어요.</li>';
            } else {
                rankingData.forEach((animal, index) => {
                    const li = document.createElement('li');
                    // 1위, 2위, 3위에 메달 아이콘 추가
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = index < 3 ? `<span class="rank-medal">${medals[index]}</span>` : `<span class="rank-medal">${index + 1}위</span>`;
                    
                    li.innerHTML = `${medal} <span class="rank-name">${animal.name}</span> <span class="rank-count">${animal.count}회</span>`;
                    rankingList.appendChild(li);
                });
            }

            showPage('ranking');
        } catch (error) {
            displayError(error.message);
        }
    }
    // 4. 이벤트 리스너 설정
    // --- 모든 버튼의 이벤트 리스너를 여기에 모아서 관리합니다 ---
    imageUploadInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
    takePhotoBtn.addEventListener('click', startCamera);
    if(startQuizBtn) startQuizBtn.addEventListener('click', startQuiz);
    captureBtn.addEventListener('click', () => {
        cameraCanvas.width = cameraView.videoWidth;
        cameraCanvas.height = cameraView.videoHeight;
        cameraCanvas.getContext('2d').drawImage(cameraView, 0, 0);
        cameraCanvas.toBlob(blob => {
            const file = new File([blob], `photo.jpg`, { type: 'image/jpeg' });
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
    quizNextBtn.addEventListener('click', () => {
        currentQuestionIndex++;
        displayQuizQuestion();
    });
    quizQuitBtn.addEventListener('click', () => {
        if (confirm('퀴즈를 포기하고 시작 화면으로 돌아가시겠습니까?')) {
            window.location.reload();
        }
    });

    // 랭킹 페이지 버튼들
    if (rankingBtn) {
        rankingBtn.addEventListener('click', showRanking);
    }
    if (rankingBackBtn) {
        rankingBackBtn.addEventListener('click', () => showPage('start'));
    }

    // 5. 애플리케이션 초기화
    showPage('start');
});