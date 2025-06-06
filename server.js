console.log("--- server.js 파일이 새로 저장되어 실행되었습니다 ---");
require('dotenv').config(); // .env 파일에서 환경변수 로드
// 환경변수 값 콘솔 확인 (초기 개발 단계에서만!)
// 실제 서비스 배포시엔 삭제하세요(보안 이유)
// console.log("AZURE_STORAGE_CONNECTION_STRING:", process.env.AZURE_STORAGE_CONNECTION_STRING);
// console.log("LOG_TABLE_NAME:", process.env.LOG_TABLE_NAME);
// console.log("CUSTOM_VISION_PREDICTION_KEY:", process.env.CUSTOM_VISION_PREDICTION_KEY);
// console.log("CUSTOM_VISION_ENDPOINT:", process.env.CUSTOM_VISION_ENDPOINT);
// console.log("CUSTOM_VISION_PROJECT_ID:", process.env.CUSTOM_VISION_PROJECT_ID);
// console.log("CUSTOM_VISION_PUBLISHED_NAME:", process.env.CUSTOM_VISION_PUBLISHED_NAME);

const express = require('express');

const multer = require('multer');
const { TableServiceClient, AzureNamedKeyCredential, odata } = require("@azure/data-tables"); // Table Storage SDK
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 고유 ID 생성

const app = express();
const port = process.env.PORT || 3000;

// --- Azure 서비스 클라이언트 설정 ---

// Azure Storage (Table Storage용)
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const LOG_TABLE_NAME = process.env.LOG_TABLE_NAME;

if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error("Azure Storage Connection string not found in .env file.");
}
if (!LOG_TABLE_NAME) {
    throw new Error("Azure Table Storage LOG_TABLE_NAME not found in .env file.");
}

const { TableClient } = require("@azure/data-tables");

const logTableClient = TableClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING,
  LOG_TABLE_NAME
);
// 서버 시작 시 테이블이 없으면 생성
(async () => {
    try {
        await logTableClient.createTable();
        console.log(`Table '${LOG_TABLE_NAME}' created or already exists.`);
    } catch (error) {
        // 테이블이 이미 존재하면 오류가 발생할 수 있으나, 일반적으로 무시 가능
        if (error.statusCode === 409) {
            console.log(`Table '${LOG_TABLE_NAME}' already exists.`);
        } else {
            console.error(`Error creating table '${LOG_TABLE_NAME}':`, error.message);
            // throw error; // 필요시 에러를 다시 던져 서버 시작 중단
        }
    }
})();


// Custom Vision
const customVisionPredictionKey = process.env.CUSTOM_VISION_PREDICTION_KEY;
const customVisionEndpoint = process.env.CUSTOM_VISION_ENDPOINT;
const customVisionProjectId = process.env.CUSTOM_VISION_PROJECT_ID;
const customVisionPublishedName = process.env.CUSTOM_VISION_PUBLISHED_NAME;

if (!customVisionPredictionKey || !customVisionEndpoint || !customVisionProjectId || !customVisionPublishedName) {
    console.error("Custom Vision API credentials missing from .env file.");
    process.exit(1);
}
// 이미지 데이터를 직접 전송하는 Custom Vision API 엔드포인트 (nostore 옵션 사용)
const customVisionUrl = `${customVisionEndpoint}customvision/v3.0/Prediction/${customVisionProjectId}/classify/iterations/${customVisionPublishedName}/image/nostore`;


// --- 동물 정보 로드 ---
let animalData = {};
try {
    // 현재 파일(server.js)의 절대 경로를 기준으로 'animal-data.json' 파일의 전체 경로를 생성합니다.
    // 이 방법이 상대 경로보다 훨씬 안정적입니다.
    const jsonPath = path.join(__dirname, 'animal-data.json');

    // 파일을 텍스트(UTF-8 형식)로 읽어옵니다.
    const rawData = fs.readFileSync(jsonPath, 'utf-8');

    // 읽어온 텍스트를 JSON 객체로 변환(파싱)합니다.
    animalData = JSON.parse(rawData);

    // 성공적으로 파일을 불러왔는지 확인하기 위한 로그
    console.log("animal-data.json 파일을 성공적으로 불러왔습니다.");

} catch (error) {
    // 만약 오류가 발생하면, 어떤 종류의 오류인지 자세히 출력합니다.
    // (예: 파일이 정말 없는 경우, 또는 JSON 파일 내부에 오타가 있는 경우 등)
    console.error("animal-data.json 파일을 읽거나 파싱하는 중 오류가 발생했습니다:", error);
    process.exit(1); // 치명적인 오류이므로 서버 실행을 중단합니다.
}

// --- 미들웨어 설정 ---
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer 설정 (메모리 저장)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Helper Functions ---
async function logToTableStorage(logData) {
    try {
        const timestamp = new Date();
        const entity = {
            partitionKey: `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`, // YYYY-MM-DD
            rowKey: uuidv4(), // 고유한 RowKey
            timestamp: timestamp.toISOString(),
            anonymousId: logData.anonymousId || 'unknown',
            // imageUrl은 이제 없으므로 제거하거나, 필요시 파일명을 저장할 수 있습니다.
            // predictions: JSON.stringify(logData.predictions), // Table Storage는 복잡한 객체 저장을 위해 JSON 문자열화 필요
            predictionCount: logData.predictions ? logData.predictions.length : 0,
            topMatchTag: logData.topMatchTag || 'N/A',
            servedAnimalName: logData.servedAnimalName || "No match",
            errorMessage: logData.error || null, // 에러 발생 시 에러 메시지
            // 필요한 추가 정보들을 여기에 필드로 추가할 수 있습니다.
            // Table Storage는 각 필드가 최대 64KB의 문자열, 숫자, boolean, 날짜, 이진 데이터 등을 지원합니다.
            // 전체 엔티티 크기는 1MB를 넘을 수 없고, 최대 252개의 사용자 정의 속성을 가질 수 있습니다.
        };

        // 가장 높은 확률의 예측만 간단히 저장 (선택 사항)
        if (logData.predictions && logData.predictions.length > 0) {
            const topPred = logData.predictions.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
            entity.topPredictionTagName = topPred.tagName;
            entity.topPredictionProbability = topPred.probability;
        }


        await logTableClient.createEntity(entity);
        console.log(`Log created in Table Storage with PartitionKey: ${entity.partitionKey}, RowKey: ${entity.rowKey}`);
    } catch (error) {
        console.error("Error logging to Azure Table Storage:", error.message);
        if (error.response) console.error("Table Storage Error Details:", error.response.data);
    }
}


// --- API 라우트 ---
// --- API 라우트 ---
app.post('/api/predict', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: '이미지 파일이 필요합니다.' });
    }

    const anonymousId = req.body.anonymousId || 'unknown';
    let logEntry = { anonymousId, predictions: null, topMatchTag: null, servedAnimalName: null };

    try {
        // 1. Azure Custom Vision REST API 호출
        const predictionResponse = await axios.post(customVisionUrl, req.file.buffer, {
            headers: {
                'Prediction-Key': customVisionPredictionKey,
                'Content-Type': 'application/octet-stream'
            }
        });

        // ✅ predictions 변수가 여기서 생성됩니다.
        const predictions = predictionResponse.data.predictions;
        logEntry.predictions = predictions;

        let animalInfo = null;

        if (predictions && predictions.length > 0) {
            // ✅ 따라서 predictions를 사용하는 이 로직은 바로 아래에 위치해야 합니다.
            const confidenceThreshold = parseFloat(process.env.CUSTOM_VISION_CONFIDENCE_THRESHOLD) || 0.5;
            const confidentPredictions = predictions.filter(p => p.probability > confidenceThreshold);

            if (confidentPredictions.length > 0) {
                const topPrediction = confidentPredictions[0];
                 logEntry.topMatchTag = topPrediction.tagName;
                 animalInfo = animalData[topPrediction.tagName.toLowerCase()];
                 if (animalInfo) {
                    logEntry.servedAnimalName = animalInfo.name;
                 }
            }
        }

        // 2. 로그 저장 (Azure Table Storage)
        await logToTableStorage(logEntry);

        if (animalInfo) {
            res.json({
                message: '예측 성공!',
                predictions: predictions,
                animalInfo: animalInfo
            });
        } else {
            res.status(404).json({ message: '일치하는 동물 정보를 찾을 수 없거나, 예측 확률이 낮습니다.', predictions: predictions });
        }

    } catch (error) {
        console.error('Server error:', error.response ? error.response.data : error.message);
        logEntry.error = error.message;
        await logToTableStorage(logEntry);
        res.status(500).json({ message: '서버에서 오류가 발생했습니다: ' + error.message });
    }
});

// --- 서버 시작 ---
app.listen(port, () => {
    console.log(`Zoo AR Guide server listening at http://localhost:${port}`);
    console.log(`Ensure your animal-data.json is in the root directory.`);
    console.log(`Ensure your .env file is correctly configured with Azure credentials.`);
    console.log(`Logging to Azure Table Storage: ${LOG_TABLE_NAME}`);
});