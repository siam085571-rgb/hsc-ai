const express = require('express');
const { Octokit } = require('@octokit/rest');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment Variables থেকে তথ্য নেওয়া
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER; // আপনার গিটহাব ইউজারনেম
const REPO_NAME = process.env.REPO_NAME;   // মেইন রিপোজিটরির নাম
const FILE_PATH = process.env.FILE_PATH || 'index.html'; // মেইন রিপোর ফাইল পাথ

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ১. মেইন রিপো থেকে ফাইল পড়া
async function getFileContent() {
    const { data } = await octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: FILE_PATH,
    });
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
}

// ২. বর্তমান লিংকগুলোর তালিকা রিটার্ন করার API
app.get('/api/links', async (req, res) => {
    try {
        const { content } = await getFileContent();
        const linksMatch = content.match(/<!-- LINK_START -->([\s\S]*?)<!-- LINK_END -->/);
        
        if (!linksMatch) {
            return res.json({ links: [] });
        }

        const linksHtml = linksMatch[1];
        const regex = /<li class="link-item">[\s\S]*?<a href="([^"]+)"[\s\S]*?pdf-icon"><\/i>\s*([\s\S]*?)<\/span>/g;
        
        let links = [];
        let match;
        while ((match = regex.exec(linksHtml)) !== null) {
            links.push({ url: match[1], title: match[2].trim() });
        }

        res.json({ links });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৩. নতুন লিংক যুক্ত করার API
app.post('/api/links/add', async (req, res) => {
    try {
        const { title, url } = req.body;
        if (!title || !url) return res.status(400).json({ error: 'Title & URL required' });

        const { content, sha } = await getFileContent();

        const newLinkHtml = `
    <li class="link-item">
        <a href="${url}" target="_blank">
            <span><i class="fa-solid fa-file-pdf pdf-icon"></i> ${title}</span>
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 12px; opacity: 0.6;"></i>
        </a>
    </li>`;

        const updatedContent = content.replace(
            '<!-- LINK_START -->',
            `<!-- LINK_START -->${newLinkHtml}`
        );

        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: FILE_PATH,
            message: `Admin: Added new link "${title}"`,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: sha,
        });

        res.json({ message: 'Link added successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৪. লিংক রিমুভ করার API
app.post('/api/links/delete', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const { content, sha } = await getFileContent();

        // নির্দিষ্ট <li> আইটেম রিমুভ করা
        const regex = new RegExp(`<li class="link-item">[\\s\\S]*?<a href="${url}"[\\s\\S]*?<\\/li>`, 'g');
        const updatedContent = content.replace(regex, '');

        await octokit.repos.createOrUpdateFileContents({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: FILE_PATH,
            message: `Admin: Removed link`,
            content: Buffer.from(updatedContent).toString('base64'),
            sha: sha,
        });

        res.json({ message: 'Link deleted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Admin Server running on port ${PORT}`));