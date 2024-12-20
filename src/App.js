import { useState, useEffect } from 'react';
import './App.css';

const CLIENT_ID = 'HzCZkMPPYm-nYPYHlfyQPw';
const REDIRECT_URI = 'http://localhost:3000';
const RANDOM_STRING = Math.random().toString(36).substring(7); // For state verification

function App() {
  const [input, setInput] = useState('');
  const [commands, setCommands] = useState([]);
  const [currentSubreddit, setCurrentSubreddit] = useState('');
  const [posts, setPosts] = useState([]);
  const [sortBy, setSortBy] = useState('hot');
  const [timeFilter, setTimeFilter] = useState('all');
  const [votedPosts, setVotedPosts] = useState({});
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    // Initialize login state from localStorage
    const savedSession = localStorage.getItem('redditSession');
    return savedSession ? true : false;
  });
  const [username, setUsername] = useState(() => {
    // Initialize username from localStorage
    return localStorage.getItem('redditUsername') || '';
  });
  const [accessToken, setAccessToken] = useState(() => 
    localStorage.getItem('redditAccessToken') || ''
  );

  // Add this useEffect to handle OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    if (code && state === localStorage.getItem('redditOAuthState')) {
      exchangeCodeForToken(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Add these new functions for OAuth flow
  const initiateOAuthLogin = () => {
    localStorage.setItem('redditOAuthState', RANDOM_STRING);
    const authUrl = `https://www.reddit.com/api/v1/authorize?`
      + `client_id=${CLIENT_ID}`
      + `&response_type=code`
      + `&state=${RANDOM_STRING}`
      + `&redirect_uri=${REDIRECT_URI}`
      + `&duration=permanent`
      + `&scope=identity read vote`;

    window.location.href = authUrl;
  };

  const exchangeCodeForToken = async (code) => {
    try {
      const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${CLIENT_ID}:`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const data = await response.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
        localStorage.setItem('redditAccessToken', data.access_token);
        await fetchUserInfo(data.access_token);
      }
    } catch (error) {
      console.error('Token exchange error:', error);
    }
  };

  const fetchUserInfo = async (token) => {
    try {
      const response = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      setUsername(data.name);
      setIsLoggedIn(true);
      localStorage.setItem('redditUsername', data.name);
      localStorage.setItem('redditSession', 'true');
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  };

  // Add fetchSubredditPosts function
  const fetchSubredditPosts = async (subreddit, sort, time) => {
    try {
      let url = `https://oauth.reddit.com/r/${subreddit}/${sort}`;
      if ((sort === 'top' || sort === 'controversial') && time !== 'all') {
        url += `?t=${time}`;
      }
      
      const headers = accessToken 
        ? { 'Authorization': `Bearer ${accessToken}` }
        : {};
        
      const response = await fetch(url, { headers });
      const data = await response.json();
      setPosts(data.data.children);
      return data.data.children;
    } catch (error) {
      console.error('Error fetching posts:', error);
      return null;
    }
  };

  const handleVote = async (postId, voteType) => {
    if (!isLoggedIn) {
      return 'Error: Must be logged in to vote';
    }

    const post = posts.find(p => p.data.id === postId);
    if (!post) {
      return `Error: Post with ID ${postId} not found`;
    }

    try {
      const dir = voteType === 'upvote' ? 1 : -1;
      const response = await fetch('https://oauth.reddit.com/api/vote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          dir: dir,
          id: `t3_${postId}`,
        }),
      });

      if (response.ok) {
        setVotedPosts({
          ...votedPosts,
          [postId]: voteType
        });
        return `Successfully ${voteType}d post: ${post.data.title}`;
      } else {
        return `Error: Failed to ${voteType} post`;
      }
    } catch (error) {
      console.error('Vote error:', error);
      return `Error: Failed to ${voteType} post`;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('redditSession');
    localStorage.removeItem('redditUsername');
    localStorage.removeItem('redditAccessToken');
    setIsLoggedIn(false);
    setUsername('');
    setAccessToken('');
    return 'Successfully logged out';
  };

  const handleLogin = async (user, password) => {
    // Initiate OAuth flow instead of simulated login
    initiateOAuthLogin();
    return 'Redirecting to Reddit for authentication...';
  };

  const handleCommand = async (command) => {
    // Store current prompt for command history
    const currentPrompt = getPrompt();

    // Add help command handler
    if (command.toLowerCase() === 'help') {
      const helpText = `
Available Commands:
  help                      Show this help message
  clear                     Clear the terminal
  login -u <user> -p <pass> Login to Reddit account
  logout                    Logout from current session
  whoami                    Display current logged in user

  cd <subreddit>           Switch to specified subreddit
  ls                        List posts in current subreddit
  ls --sort=<option>       List posts with sorting option:
    Options:
      hot                   Hot posts (default)
      new                   New posts
      top                   Top posts
      rising               Rising posts
  
  ls --sort=top --time=<option>   List top posts with time filter:
    Options:
      day                   Posts from last 24 hours
      week                  Posts from last week
      month                 Posts from last month
      year                  Posts from last year
      all                   All time top posts

  --upvote <post_id>       Upvote a post
  --downvote <post_id>     Downvote a post

Example Usage:
  cd programming           Switch to r/programming subreddit
  ls --sort=top --time=week   List top posts from this week
  --upvote abc123         Upvote post with ID abc123
`;

      const newCommand = {
        input: command,
        output: helpText,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      return;
    }

    // Handle 'clear' command
    if (command.toLowerCase() === 'clear') {
      setCommands([]);
      setInput('');
      return;
    }

    // Parse command for ls
    const args = command.split(' ');
    
    // Handle cd command
    if (args[0].toLowerCase() === 'cd') {
      if (args.length < 2) {
        const newCommand = {
          input: command,
          output: 'Error: Please specify a subreddit name. Usage: cd <subreddit>',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }
      
      const subredditName = args[1];
      const newCommand = {
        input: command,
        output: `Changed directory to: /r/${subredditName}`,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      setCurrentSubreddit(subredditName);
      return;
    }

    // Handle ls command
    if (args[0].toLowerCase() === 'ls') {
      // Handle ls command with options
      let sort = sortBy;
      let time = timeFilter;
      
      // Parse arguments
      for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--sort=')) {
          sort = args[i].split('=')[1];
        } else if (args[i].startsWith('--time=')) {
          time = args[i].split('=')[1];
        }
      }

      if (!currentSubreddit) {
        const newCommand = {
          input: command,
          output: 'Error: No subreddit selected. First select a subreddit.',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }

      // Fetch and display posts
      const posts = await fetchSubredditPosts(currentSubreddit, sort, time);
      if (posts) {
        const postsOutput = posts.map(post => {
          const voteStatus = votedPosts[post.data.id] 
            ? ` [${votedPosts[post.data.id]}d]` 
            : '';
          return `[${post.data.id}] ${post.data.title} (↑${post.data.score})${voteStatus}`;
        }).join('\n');
        
        const newCommand = {
          input: command,
          output: `Listing posts from r/${currentSubreddit} (${sort}${sort === 'top' ? `, ${time}` : ''}):\n${postsOutput}`,
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
      } else {
        const newCommand = {
          input: command,
          output: 'Error: Failed to fetch posts',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
      }
      return;
    }

    // Handle vote commands
    if (command.startsWith('--upvote') || command.startsWith('--downvote')) {
      if (!currentSubreddit) {
        const newCommand = {
          input: command,
          output: 'Error: No subreddit selected. First select a subreddit.',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }

      const args = command.split(' ');
      if (args.length !== 2) {
        const newCommand = {
          input: command,
          output: `Error: Please provide a post ID. Usage: ${args[0]} <post_id>`,
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }

      const voteType = command.startsWith('--upvote') ? 'upvote' : 'downvote';
      const postId = args[1];
      const result = await handleVote(postId, voteType);

      const newCommand = {
        input: command,
        output: result,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      return;
    }

    // Handle login command
    if (command.startsWith('login')) {
      const args = command.split(' ');
      let user = '';
      let password = '';

      // Parse username and password flags
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '-u' && args[i + 1]) {
          user = args[i + 1];
          i++; // Skip next argument since we used it
        } else if (args[i] === '-p' && args[i + 1]) {
          password = args[i + 1];
          i++; // Skip next argument since we used it
        }
      }

      if (!user || !password) {
        const newCommand = {
          input: command,
          output: 'Error: Missing required flags. Usage: login -u <username> -p <password>',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }

      const result = await handleLogin(user, password);
      const newCommand = {
        input: command.replace(password, '*'.repeat(password.length)), // Mask password in command history
        output: result,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      return;
    }

    // Handle logout command
    if (command.toLowerCase() === 'logout') {
      if (!isLoggedIn) {
        const newCommand = {
          input: command,
          output: 'Error: Not logged in',
          prompt: currentPrompt
        };
        setCommands([...commands, newCommand]);
        return;
      }

      const result = handleLogout();
      const newCommand = {
        input: command,
        output: result,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      return;
    }

    // Add this in handleCommand function, before the "Handle invalid commands" section
    if (command.toLowerCase() === 'whoami') {
      const output = isLoggedIn 
        ? `Logged in as: ${username}`
        : 'Not logged in';
        
      const newCommand = {
        input: command,
        output: output,
        prompt: currentPrompt
      };
      setCommands([...commands, newCommand]);
      return;
    }

    // Handle invalid commands
    const newCommand = {
      input: command,
      output: 'Error: Unknown command. Type help for available commands.',
      prompt: currentPrompt
    };
    setCommands([...commands, newCommand]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      handleCommand(input.trim());
      setInput('');
    }
  };

  // Add this new function to get the current prompt
  const getPrompt = () => {
    return currentSubreddit ? `/r/${currentSubreddit}` : '$';
  };

  return (
    <div className="App">
      <div className="terminal resizable">
        <div className="terminal-header">
          <span className="terminal-button red"></span>
          <span className="terminal-button yellow"></span>
          <span className="terminal-button green"></span>
          <span className="terminal-title">reddit--@terminal:~</span>
        </div>
        
        <div className="terminal-content">
          {/* Show command history */}
          {commands.map((cmd, index) => (
            <div key={index} className="command-history">
              <div className="prompt">
                <span className="prompt-symbol">{cmd.prompt || '$'}</span>
                <span className="prompt-text">{cmd.input}</span>
              </div>
              <div className="command-output">{cmd.output}</div>
            </div>
          ))}
          
          {/* Current input line */}
          <div className="prompt">
            <span className="prompt-symbol">{getPrompt()}</span>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="terminal-input"
              placeholder="Enter command..."
              spellCheck="false"
              autoFocus
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;