// GitHub 原生搜索 API - 论文GitHub仓库精准搜索工具
// 使用 GitHub Search API 精确匹配论文标题
// Node.js 18+ 原生支持 fetch，无需 node-fetch

const readline = require('readline');

// 尝试加载配置文件
let config = {};
try {
    config = require('./config.js');
} catch (error) {
    console.log('⚠️ 未找到配置文件，将使用无认证模式（速率限制较低）');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// GitHub Search API 调用
async function searchGitHub(paperTitle, token = null) {
    // 精确匹配：在 name, description, readme 中搜索
    const query = `"${paperTitle}" in:name,description,readme`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

    console.log('🔍 正在搜索...');
    console.log(`📝 搜索关键词: ${paperTitle}`);

    const headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    // 如果有 token，添加认证头（提高速率限制）
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return await response.json();
}


// 计算相关性分数 - 更严格的匹配
function calculateRelevanceScore(repo, paperTitle) {
    const titleWords = paperTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
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

    // 匹配率：匹配的词数 / 总词数
    const matchRatio = matchedWords / (titleWords.length * 2); // *2 因为检查了 name 和 description
    
    // 加入 star 数作为参考
    score += Math.log10(repo.stargazers_count + 1);

    return { score, matchRatio };
}

// 过滤和排序结果 - 只返回高相关性的仓库
function filterAndRankResults(response, paperTitle) {
    if (!response.items || response.items.length === 0) {
        return [];
    }

    const results = response.items.map(repo => {
        const { score, matchRatio } = calculateRelevanceScore(repo, paperTitle);
        return {
            name: repo.full_name,
            url: repo.html_url,
            description: repo.description,
            stars: repo.stargazers_count,
            language: repo.language,
            updated: repo.updated_at,
            score,
            matchRatio
        };
    });

    // 只保留匹配率 > 20% 的结果（过滤不相关的）
    const filtered = results.filter(r => r.matchRatio > 0.2);

    // 按分数排序
    return filtered.sort((a, b) => b.score - a.score);
}

// 显示搜索结果
function displayResults(repos, paperTitle) {
    if (repos.length === 0) {
        console.log(`\n❌ 未找到论文 "${paperTitle}" 的精确匹配 GitHub 仓库`);
        console.log('💡 可能原因：');
        console.log('   - 该论文没有公开的代码实现');
        console.log('   - 仓库名称与论文标题差异较大');
        console.log('   - 尝试使用论文的简称或缩写搜索');
        return;
    }

    console.log(`\n🎯 找到 ${repos.length} 个相关仓库:\n`);

    repos.forEach((repo, index) => {
        console.log(`[${index + 1}] ${repo.name}`);
        console.log(`   🔗 ${repo.url}`);
        console.log(`   ⭐ ${repo.stars} stars | 📝 ${repo.language || 'N/A'}`);
        if (repo.description) {
            const desc = repo.description.substring(0, 100);
            console.log(`   📄 ${desc}${repo.description.length > 100 ? '...' : ''}`);
        }
        console.log(`   📊 相关性: ${(repo.matchRatio * 100).toFixed(0)}%`);
        console.log('');
    });
}


// 搜索论文的 GitHub 仓库
async function searchPaperGitHub(paperTitle, token = null) {
    try {
        console.log(`\n🔬 正在搜索论文 "${paperTitle}" 的 GitHub 仓库...\n`);

        const response = await searchGitHub(paperTitle, token);
        
        console.log(`📊 GitHub API 返回 ${response.total_count} 个结果`);

        const rankedRepos = filterAndRankResults(response, paperTitle);
        displayResults(rankedRepos, paperTitle);

        return rankedRepos;

    } catch (error) {
        console.error('❌ 搜索失败:', error.message);
        return [];
    }
}

// 主程序
async function main() {
    try {
        const token = config.GITHUB_TOKEN || process.env.GITHUB_TOKEN;

        console.log('🚀 论文 GitHub 仓库精准搜索工具 (GitHub Native API)');
        console.log('='.repeat(55));
        console.log('📚 输入论文标题，精确搜索对应的 GitHub 仓库');
        if (!token) {
            console.log('⚠️ 未配置 GITHUB_TOKEN，使用无认证模式（60次/小时）');
        } else {
            console.log('✅ 已配置 GITHUB_TOKEN（5000次/小时）');
        }
        console.log('💡 输入 "exit" 或 "quit" 退出\n');

        while (true) {
            const paperTitle = await new Promise((resolve) => {
                rl.question('📝 请输入论文标题: ', resolve);
            });

            if (!paperTitle.trim()) {
                console.log('⚠️ 论文标题不能为空\n');
                continue;
            }

            if (['exit', 'quit', 'q'].includes(paperTitle.toLowerCase())) {
                console.log('👋 再见！');
                break;
            }

            await searchPaperGitHub(paperTitle.trim(), token);
            console.log('\n' + '='.repeat(55));
        }

    } catch (error) {
        console.error('❌ 程序错误:', error.message);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { searchPaperGitHub, searchGitHub };
