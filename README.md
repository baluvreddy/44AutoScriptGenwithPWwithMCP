# 🚀 Excel to Playwright Test Automation Framework

A comprehensive test automation framework that converts Excel test cases into executable Playwright tests with AI-powered self-healing capabilities.

![Test Automation Dashboard](https://img.shields.io/badge/Framework-Playwright-green) ![Backend](https://img.shields.io/badge/Backend-FastAPI-blue) ![AI](https://img.shields.io/badge/AI-Gemini-orange) ![Frontend](https://img.shields.io/badge/Frontend-Vanilla_JS-yellow)

## ✨ Features

### 🔄 **Excel to Test Conversion**
- Parse Excel files with flexible column mapping
- Support for various Excel formats and structures
- Automatic test case standardization
- JSON export for processed test cases

### 🤖 **AI-Powered Test Generation**
- Generate Playwright test scripts from Excel data using Gemini AI
- Intelligent test step interpretation
- Context-aware selector generation
- Natural language to code conversion

### 🛠️ **Multi-Level Self-Healing**
1. **Initial Attempt**: Direct test execution
2. **Local Healing**: Basic selector fixes and timing adjustments
3. **Gemini Healing**: AI-powered healing with screenshot analysis
4. **Advanced Healing**: Sophisticated DOM analysis and fallback strategies

### 📊 **Real-Time Dashboard**
- Live test execution monitoring
- Real-time statistics (Total, Passed, Failed, In Progress, Self-Healing)
- Interactive test results table
- Error logs with screenshot capture
- Code comparison between healing attempts

### 🔍 **Advanced Debugging**
- Screenshot capture on test failures
- Detailed error logging with timestamps
- Visual comparison of different healing attempts
- Downloadable error reports and test artifacts

## 🏗️ Architecture

\`\`\`
├── main.py                 # FastAPI backend server
├── utils/
│   ├── excel_parser.py     # Excel file parsing and standardization
│   └── test_runner.py      # Test execution management
├── static/
│   ├── index.html          # Web dashboard interface
│   ├── scripts.js          # Frontend JavaScript
│   └── styles.css          # Dashboard styling
├── generate_and_runall.js  # Test generation and execution engine
├── playwright.config.js    # Playwright configuration
├── requirements.txt        # Python dependencies
└── README.md              # This file
\`\`\`

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- Playwright browsers

### Installation

1. **Clone the repository**
   \`\`\`bash
   git clone <repository-url>
   cd test-automation-framework
   \`\`\`

2. **Install Python dependencies**
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

3. **Install Node.js dependencies**
   \`\`\`bash
   npm install playwright
   npx playwright install
   \`\`\`

4. **Set up environment variables**
   \`\`\`bash
   export GEMINI_API_KEY="your-gemini-api-key"
   export CI="false"  # Set to true for CI environments
   \`\`\`

### Running the Application

1. **Start the FastAPI server**
   \`\`\`bash
   python main.py
   \`\`\`
   The server will start on `http://localhost:8000`

2. **Access the dashboard**
   Open your browser and navigate to `http://localhost:8000`

3. **Upload Excel file**
   - Click "Choose File" and select your Excel test cases file
   - Click "Upload and Parse Excel" to process the file

4. **Generate and run tests**
   - Click "Generate and Run Playwright Tests"
   - Monitor real-time progress on the dashboard

## 📋 Excel Format Requirements

Your Excel file should contain the following columns (flexible naming supported):

| Column | Description | Example |
|--------|-------------|---------|
| Test Case ID | Unique identifier | TC_001 |
| Test Case Name | Descriptive name | Login with valid credentials |
| Test Steps | Step-by-step actions | 1. Navigate to login page<br>2. Enter username<br>3. Enter password<br>4. Click login |
| Test Data | Input data | username: admin<br>password: password123 |
| Expected Result | Expected outcome | User should be logged in successfully |

## 🔧 Configuration

### Playwright Configuration
Edit `playwright.config.js` to customize:
- Browser settings (Chrome, Firefox, Safari)
- Viewport size and device emulation
- Test timeouts and retries
- Screenshot and video recording

### API Configuration
Modify `main.py` for:
- Server port and host settings
- File upload limits
- CORS configuration
- Logging levels

## 🤖 AI Integration

### Gemini API Setup
1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Set the environment variable:
   \`\`\`bash
   export GEMINI_API_KEY="your-api-key-here"
   \`\`\`

### Self-Healing Strategies
The framework employs multiple healing strategies:

1. **Local Healing**: Basic fixes for common issues
   - Selector adjustments
   - Timing improvements
   - Element state validation

2. **AI Healing**: Advanced fixes using Gemini
   - Screenshot analysis
   - Context-aware selector generation
   - Natural language error interpretation

3. **Advanced Healing**: Sophisticated DOM analysis
   - Multiple selector fallbacks
   - Element relationship mapping
   - Dynamic content handling

## 📊 Dashboard Features

### Real-Time Monitoring
- **Live Status Updates**: See current test execution status
- **Progress Tracking**: Monitor test completion in real-time
- **Statistics Dashboard**: View pass/fail rates and healing attempts

### Test Results
- **Interactive Table**: Sortable and filterable test results
- **Error Details**: Detailed error messages with timestamps
- **Screenshot Gallery**: Visual debugging with failure screenshots
- **Code Comparison**: Compare original vs healed test code

### Export Capabilities
- **JSON Export**: Download processed test cases
- **Error Logs**: Export detailed error reports
- **Screenshots**: Download failure screenshots
- **Test Artifacts**: Access generated test files

## 🛠️ Development

### Adding New Healing Strategies
1. Extend the healing functions in `generate_and_runall.js`
2. Add new strategy logic to the attempt handling
3. Update the dashboard to display new healing types

### Customizing Excel Parsing
1. Modify `utils/excel_parser.py`
2. Add new column mapping patterns
3. Extend the standardization logic

### Enhancing the Dashboard
1. Update `static/index.html` for new UI elements
2. Extend `static/scripts.js` for new functionality
3. Style changes in `static/styles.css`

## 🔍 Troubleshooting

### Common Issues

**Tests not running in headed mode**
- Ensure `playwright.config.js` has `headless: false`
- Check that display is available (for Linux servers)

**Excel parsing errors**
- Verify column names match expected patterns
- Check for merged cells or complex formatting
- Ensure data types are consistent

**AI healing not working**
- Verify `GEMINI_API_KEY` is set correctly
- Check API quota and rate limits
- Ensure screenshots are being captured

**Dashboard not updating**
- Check browser console for JavaScript errors
- Verify WebSocket connections (if implemented)
- Ensure polling intervals are appropriate

## 📈 Performance Tips

- **Batch Processing**: Process multiple test cases efficiently
- **Parallel Execution**: Configure Playwright for parallel test runs
- **Resource Management**: Monitor memory usage during large test suites
- **Caching**: Implement caching for repeated test patterns

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Playwright](https://playwright.dev/) for the robust testing framework
- [FastAPI](https://fastapi.tiangolo.com/) for the high-performance web framework
- [Google Gemini](https://ai.google.dev/) for AI-powered test healing
- [Pandas](https://pandas.pydata.org/) for Excel processing capabilities

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review the configuration documentation

---

**Happy Testing! 🎉**
