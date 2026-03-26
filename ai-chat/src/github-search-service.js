/**
 * GitHub 搜索服务 - 浏览器端可用
 * 搜索论文对应的 GitHub 代码仓库
 */

const GITHUB_API_BASE = 'https://api.github.com';

class GitHubSearchService {
    constructor() {
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    /**
     * 搜索论文对应的 GitHub 仓库
     * @param {string} paperTitle - 论文标题
     * @returns {Promise<Array>} 排序后的仓库列表
     */
    async searchPaperRepo(paperTitle) {
        if (!paperTitle || paperTitle.trim().length === 0) {
            return [];
        }

        try {
            const query = `"${paperTitle}" in:name,description,readme`;
            const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

            const headers = {
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            };

            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                console.error('[GitHubSearch] API 请求失败:', response.status);
                return [];
            }

            const data = await response.json();
            return this._filterAndRankResults(data, paperTitle);
        } catch (error) {
            console.error('[GitHubSearch] 搜索失败:', error);
            return [];
        }
    }

    /**
     * 过滤和排序搜索结果
     */
    _filterAndRankResults(response, paperTitle) {
        if (!response.items || response.items.length === 0) {
            return [];
        }

        const titleWords = paperTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        const results = response.items.map(repo => {
            const repoName = repo.name.toLowerCase();
            const description = (repo.description || '').toLowerCase();
            
            let score = 0;
            let matchedWords = 0;

            titleWords.forEach(word => {
                if (repoName.includes(word)) {
                    score += 3;
                    matchedWords++;
                }
                if (description.includes(word)) {
                    score += 1;
                    matchedWords++;
                }
            });

            const matchRatio = matchedWords / (titleWords.length * 2);
            score += Math.log10(repo.stargazers_count + 1);

            return {
                name: repo.full_name,
                url: repo.html_url,
                description: repo.description,
                stars: repo.stargazers_count,
                language: repo.language,
                score,
                matchRatio
            };
        });

        // 只保留匹配率 > 20% 的结果
        return results
            .filter(r => r.matchRatio > 0.2)
            .sort((a, b) => b.score - a.score);
    }
}

// 单例导出
const githubSearchService = new GitHubSearchService();
export default githubSearchService;
