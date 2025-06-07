// quiz-generator.js

// 배열을 무작위로 섞는 도우미 함수 (피셔-예이츠 셔플)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 퀴즈 생성 메인 함수
function generateQuiz(animalData) {
    const allAnimalKeys = Object.keys(animalData);
    if (allAnimalKeys.length < 5) {
        throw new Error("퀴즈를 만들기에 동물 데이터가 충분하지 않습니다. (최소 5개 필요)");
    }

    // 1. 퀴즈에 사용할 동물 5마리를 중복 없이 무작위로 선택
    const selectedKeys = shuffle([...allAnimalKeys]).slice(0, 5);
    const quizAnimals = selectedKeys.map(key => ({ key, ...animalData[key] }));

    const quiz = [];

    // 2. 1~3번 이름 맞추기 문제 생성
    for (let i = 0; i < 3; i++) {
        const correctAnimal = quizAnimals[i];
        
        // 오답 선택지 만들기: 정답을 제외한 전체 동물 이름 목록에서 2개 무작위 선택
        const wrongOptions = shuffle([...allAnimalKeys])
            .filter(key => key !== correctAnimal.key)
            .slice(0, 2)
            .map(key => animalData[key].name);

        const options = shuffle([...wrongOptions, correctAnimal.name]);

        quiz.push({
            type: 'name_quiz',
            image: correctAnimal.image,
            options: options,
            answer: correctAnimal.name,
        });
    }

    // 3. 4~5번 특징이 아닌 것 찾기 문제 생성
    const featureTypes = {
        habitat: "서식지",
        diet: "식습관",
        endangered: "멸종위기등급",
    };

    for (let i = 3; i < 5; i++) {
        const correctAnimal = quizAnimals[i];
        const featureKeys = shuffle(Object.keys(featureTypes)); // 'habitat', 'diet', 'endangered' 섞기

        // 정답 특징 2개 선택
        const correctFeatures = featureKeys.slice(0, 2).map(key => {
            return `${featureTypes[key]}: ${correctAnimal[key]}`;
        });

        // 오답 특징 1개 만들기 (다른 랜덤 동물의 특징 가져오기)
        let randomWrongAnimal;
        do {
            const randomKey = allAnimalKeys[Math.floor(Math.random() * allAnimalKeys.length)];
            randomWrongAnimal = animalData[randomKey];
        } while (randomWrongAnimal.name === correctAnimal.name); // 같은 동물이 뽑히지 않도록
        
        const wrongFeatureKey = featureKeys[2]; // 정답으로 쓰지 않은 나머지 특징 유형
        const wrongFeature = `${featureTypes[wrongFeatureKey]}: ${randomWrongAnimal[wrongFeatureKey]}`;
        
        const options = shuffle([...correctFeatures, wrongFeature]);

        quiz.push({
            type: 'feature_quiz_wrong',
            question: `다음 중 '${correctAnimal.name}'의 특징이 아닌 것은?`,
            image: correctAnimal.image,
            options: options,
            answer: wrongFeature,
        });
    }

    return quiz;
}

// 다른 파일에서 generateQuiz 함수를 사용할 수 있도록 export
module.exports = { generateQuiz };