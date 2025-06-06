// 1. 고유 ID 생성 (사용자님이 보신 첫 줄)
const anonymousId = 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10);

document.getElementById('imageUpload').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    // 2. 생성된 ID를 form 데이터에 추가하여 서버로 전송 (★★★★★ 가장 중요한 부분)
    formData.append('anonymousId', anonymousId);

    // 3. 사용자 경험(UX)을 위한 로딩 메시지 표시 (개선 제안)
    document.getElementById('result').innerText = '분석 중입니다...';

    try {
        // 서버로 이미지 전송
        const response = await fetch('/api/predict', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        // 결과를 화면에 표시(예시: result 라는 id의 div가 있을 때)
        document.getElementById('result').innerText = JSON.stringify(result, null, 2);
    } catch (err) {
        document.getElementById('result').innerText = '서버 오류: ' + err.message;
    }
});