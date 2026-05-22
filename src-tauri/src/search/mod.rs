#[cfg(test)]
mod tests {
    fn hybrid_rank(lexical_score: f64, semantic_score: f64) -> f64 {
        (lexical_score * 0.55) + (semantic_score * 0.45)
    }

    #[test]
    fn weights_lexical_and_semantic_scores() {
        let score = hybrid_rank(0.8, 0.9);
        assert!((score - 0.845).abs() < f64::EPSILON);
    }
}
