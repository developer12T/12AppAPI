function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
        Array.from({ length: a.length + 1 }, (_, j) => (i && j ? 0 : i || j))
    );

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] =
                b[i - 1] === a[j - 1]
                    ? matrix[i - 1][j - 1]
                    : Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) + 1;
        }
    }

    return matrix[b.length][a.length];
}

function calculateSimilarity(a, b) {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 100;
    const distance = levenshteinDistance(a || "", b || "");
    return ((maxLength - distance) / maxLength) * 100;
}

module.exports = { calculateSimilarity }