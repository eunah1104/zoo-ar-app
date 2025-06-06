console.log("--- server.js 파일이 새로 저장되어 실행되었습니다 ---");

require('dotenv').config(); // .env 파일에서 환경변수 로드

const express = require('express');
const multer = require('multer');
// 수정: 사용하지 않는 import 제거
const { TableServiceClient } = require("@azure/data-tables"); // Table Storage SDK
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

// 수정: 연결 문자열 유효성 검증 추가
let tableServiceClient;
let logTableClient;

try {
    tableServiceClient = TableServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    logTableClient = tableServiceClient.getTableClient(LOG_TABLE_NAME);
} catch (error) {
    console.error("Invalid Azure Storage connection string:", error.message);
    process.exit(1);
}

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

// 수정: URL 유효성 검증 추가
let customVisionUrl;
try {
    customVisionUrl = `${customVisionEndpoint}customvision/v3.0/Prediction/${customVisionProjectId}/classify/iterations/${customVisionPublishedName}/image/nostore`;
    new URL(customVisionUrl); // URL 유효성 검증
} catch (error) {
    console.error("Invalid Custom Vision endpoint URL:", error.message);
    process.exit(1);
}

// --- 동물 정보 로드 ---
let animalData = {};
try {
    const jsonPath = path.join(__dirname, 'animal-data.json');
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    animalData = JSON.parse(rawData);
    
    // 수정: 동물 데이터 구조 검증 추가
    if (typeof animalData !== 'object' || animalData === null) {
        throw new Error("Invalid animal data structure");
    }
    
    console.log("animal-data.json 파일을 성공적으로 불러왔습니다.");
    console.log(`동물 데이터 개수: ${Object.keys(animalData).length}`);
    
} catch (error) {
    console.error("animal-data.json 파일을 읽거나 파싱하는 중 오류가 발생했습니다:", error);
    process.exit(1);
}

// --- 미들웨어 설정 ---
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer 설정 (메모리 저장)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB 제한 추가
    },
    fileFilter: (req, file, cb) => {
        // 수정: 이미지 파일 타입 검증 추가
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
        }
    }
});

// --- Helper Functions ---
async function logToTableStorage(logData) {
    try {
        const timestamp = new Date();
        const entity = {
            partitionKey: `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`,
            rowKey: uuidv4(),
            timestamp: timestamp.toISOString(),
            anonymousId: logData.anonymousId || 'unknown',
            predictionCount: logData.predictions ? logData.predictions.length : 0,
            topMatchTag: logData.topMatchTag || 'N/A',
            servedAnimalName: logData.servedAnimalName || "No match",
            errorMessage: logData.error || null,
        };

        // 수정: 가장 높은 확률의 예측 정보 저장 개선
        if (logData.predictions && logData.predictions.length > 0) {
            const sortedPredictions = logData.predictions.sort((a, b) => b.probability - a.probability);
            const topPred = sortedPredictions[0];
            entity.topPredictionTagName = topPred.tagName;
            entity.topPredictionProbability = topPred.probability;
            
            // 수정: 상위 3개 예측 결과 저장 (문자열 길이 제한 고려)
            const top3Predictions = sortedPredictions.slice(0, 3).map(p => 
                `${p.tagName}:${p.probability.toFixed(3)}`
            ).join(',');
            if (top3Predictions.length < 1000) { // Table Storage 필드 크기 제한 고려
                entity.top3Predictions = top3Predictions;
            }
        }

        await logTableClient.createEntity(entity);
        console.log(`Log created in Table Storage with PartitionKey: ${entity.partitionKey}, RowKey: ${entity.rowKey}`);
    } catch (error) {
        console.error("Error logging to Azure Table Storage:", error.message);
        if (error.response) console.error("Table Storage Error Details:", error.response.data);
        // 수정: 로깅 실패가 전체 요청을 실패시키지 않도록 함
        // throw하지 않고 로그만 남김
    }
}

// 수정: 동물 정보 검색 함수 개선 (대소문자 구분 없이)
function findAnimalInfo(tagName) {
    if (!tagName) return null;
    
    // 정확한 매치 시도
    if (animalData[tagName]) {
        return animalData[tagName];
    }
    
    // 소문자로 변환하여 매치 시도
    const lowerTagName = tagName.toLowerCase();
    if (animalData[lowerTagName]) {
        return animalData[lowerTagName];
    }
    
    // 키들을 소문자로 변환하여 매치 시도
    const matchedKey = Object.keys(animalData).find(key => 
        key.toLowerCase() === lowerTagName
    );
    
    return matchedKey ? animalData[matchedKey] : null;
}

// --- API 라우트 ---
app.post('/api/predict', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: '이미지 파일이 필요합니다.' });
    }

    const anonymousId = req.body.anonymousId || 'unknown';
    let logEntry = { anonymousId, predictions: null, topMatchTag: null, servedAnimalName: null };

    try {
        // 1. Azure Custom Vision REST API 호출 (이미지 데이터 직접 전송)
        const predictionResponse = await axios.post(customVisionUrl, req.file.buffer, {
            headers: {
                'Prediction-Key': customVisionPredictionKey,
                'Content-Type': 'application/octet-stream'
            },
            timeout: 30000 // 수정: 타임아웃 추가
        });

        const predictions = predictionResponse.data.predictions;
        logEntry.predictions = predictions;

        let animalInfo = null;

        if (predictions && predictions.length > 0) {
            // 수정: 예측 결과를 확률 순으로 정렬
            const sortedPredictions = predictions.sort((a, b) => b.probability - a.probability);
            const confidentPredictions = sortedPredictions.filter(p => p.probability > 0.6);
            
            if (confidentPredictions.length > 0) {
                const topPrediction = confidentPredictions[0];
                logEntry.topMatchTag = topPrediction.tagName;
                
                // 수정: 개선된 동물 정보 검색 함수 사용
                animalInfo = findAnimalInfo(topPrediction.tagName);
                if (animalInfo) {
                    logEntry.servedAnimalName = animalInfo.name;
                }
            }
        }

        // 2. 로그 저장 (Azure Table Storage) - 수정: 실패해도 요청은 계속 진행
        try {
            await logToTableStorage(logEntry);
        } catch (logError) {
            console.error('Logging failed, but continuing with response:', logError.message);
        }

        if (animalInfo) {
            res.json({
                message: '예측 성공!',
                predictions: predictions.sort((a, b) => b.probability - a.probability), // 수정: 정렬된 예측 결과 반환
                animalInfo: animalInfo
            });
        } else {
            res.status(404).json({ 
                message: '일치하는 동물 정보를 찾을 수 없거나, 예측 확률이 낮습니다.', 
                predictions: predictions.sort((a, b) => b.probability - a.probability) // 수정: 정렬된 예측 결과 반환
            });
        }

    } catch (error) {
        console.error('Server error:', error.response ? error.response.data : error.message);
        logEntry.error = error.message;
        
        // 수정: 로깅 실패가 에러 응답을 방해하지 않도록 분리
        try {
            await logToTableStorage(logEntry);
        } catch (logError) {
            console.error('Error logging failed request:', logError.message);
        }
        
        // 수정: 에러 메시지 개선
        let errorMessage = '서버에서 오류가 발생했습니다.';
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            errorMessage = 'Custom Vision 서비스에 연결할 수 없습니다.';
        } else if (error.response && error.response.status === 401) {
            errorMessage = 'Custom Vision API 인증에 실패했습니다.';
        } else if (error.response && error.response.status === 429) {
            errorMessage = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
        }
        
        res.status(500).json({ message: errorMessage });
    }
});

// 수정: 헬스체크 엔드포인트 추가
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        animalDataLoaded: Object.keys(animalData).length > 0
    });
});

// --- 서버 시작 ---
app.listen(port, () => {
    console.log(`Zoo AR Guide server listening at http://localhost:${port}`);
    console.log(`Ensure your animal-data.json is in the root directory.`);
    console.log(`Ensure your .env file is correctly configured with Azure credentials.`);
    console.log(`Logging to Azure Table Storage: ${LOG_TABLE_NAME}`);
});