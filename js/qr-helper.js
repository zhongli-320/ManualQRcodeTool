class QRHelper {
    constructor() {
        this.canvas = document.getElementById('qrcodeCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.imageData = null;
        this.qrData = [];
        this.currentStep = 0;
        this.totalSteps = 0;
        this.isDrawing = false;
        this.qrSize = 21;
        this.cellSize = 20;
        this.imageLoaded = false;
        
        // 新增：坐标显示优化相关变量
        this.lastDisplayedRow = null;
        this.lastDisplayedCol = null;
        this.highlightedRow = undefined;
        this.highlightedCol = undefined;
        this.mouseMoveRAF = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 文件上传
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.processImageFile(files[0]);
            }
        });

        // 鼠标悬停显示坐标 - 使用节流优化性能
        this.canvas.addEventListener('mousemove', this.throttle((e) => this.handleMouseMove(e), 16)); // 约60fps
        this.canvas.addEventListener('mouseleave', () => this.hideCoordinates());

        // 控制按钮
        document.getElementById('startBtn').addEventListener('click', () => this.startDrawing());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextStep());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        // 二维码规格选择
        document.getElementById('qrSize').addEventListener('change', (e) => {
            this.qrSize = parseInt(e.target.value);
            if (this.imageLoaded) {
                this.analyzeQRCode();
            }
        });

        // 显示大小功能已移除，保持默认20px大小
    }
    
    // 节流函数：限制函数执行频率
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            this.processImageFile(file);
        }
    }

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件！');
            this.updateCanvasStatus('❌ 请上传图片文件！');
            return;
        }

        console.log('开始处理图片文件:', file.name, '类型:', file.type);
        this.updateCanvasStatus('正在处理文件: ' + file.name);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('文件读取成功，数据长度:', e.target.result.length);
            this.updateCanvasStatus('文件读取成功，正在加载图片...');
            const img = new Image();
            img.onload = () => {
                console.log('图片加载成功，尺寸:', img.width, 'x', img.height);
                this.updateCanvasStatus(`图片加载成功: ${img.width}x${img.height}`);
                this.loadImage(img);
            };
            img.onerror = () => {
                console.error('图片加载失败');
                this.updateCanvasStatus('❌ 图片加载失败，请检查文件格式');
                alert('图片加载失败，请检查文件格式');
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            console.error('文件读取失败');
            this.updateCanvasStatus('❌ 文件读取失败！');
            alert('文件读取失败');
        };
        reader.readAsDataURL(file);
    }

    loadImage(img) {
        console.log('开始加载图片到画布');
        this.updateCanvasStatus('正在加载图片...');
        
        try {
            // 调整画布大小
            const maxSize = 400;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width *= ratio;
                height *= ratio;
            }

            this.canvas.width = width;
            this.canvas.height = height;
            
            // 绘制图片
            this.ctx.drawImage(img, 0, 0, width, height);
            console.log('图片已绘制到画布，尺寸:', width, 'x', height);
            this.updateCanvasStatus(`图片加载成功！尺寸: ${width}x${height}`);
            
            // 获取图像数据
            this.imageData = this.ctx.getImageData(0, 0, width, height);
            this.imageLoaded = true;
            
            // 立即绘制网格让用户看到效果
            this.drawGrid();
            console.log('网格已绘制');
            this.updateCanvasStatus('网格绘制完成，正在分析二维码...');
            
            // 分析二维码
            this.analyzeQRCode();
            
            // 启用开始按钮
            document.getElementById('startBtn').disabled = false;
            
            // 更新上传区域文字和样式
            const uploadArea = document.querySelector('.upload-area');
            uploadArea.classList.add('uploaded');
            document.querySelector('.upload-area h3').textContent = '图片已上传，点击重新选择';
            
            // 确保画布可见
            this.canvas.style.display = 'block';
            console.log('图片加载完成');
            this.updateCanvasStatus('图片处理完成！可以开始手绘了');
            
        } catch (error) {
            console.error('图片加载失败:', error);
            this.updateCanvasStatus('❌ 图片加载失败: ' + error.message);
            alert('图片加载失败: ' + error.message);
        }
    }

    analyzeQRCode() {
        if (!this.imageData) {
            console.error('没有图像数据可供分析');
            return;
        }
        
        console.log('开始分析二维码，规格:', this.qrSize, 'x', this.qrSize);

        const width = this.imageData.width;
        const height = this.imageData.height;
        const data = this.imageData.data;
        
        // 计算每个格子的大小
        const cellWidth = width / this.qrSize;
        const cellHeight = height / this.qrSize;
        
        this.qrData = [];
        
        // 分析每个格子
        for (let row = 0; row < this.qrSize; row++) {
            const rowData = [];
            for (let col = 0; col < this.qrSize; col++) {
                // 计算格子的中心点
                const centerX = Math.floor(col * cellWidth + cellWidth / 2);
                const centerY = Math.floor(row * cellHeight + cellHeight / 2);
                const pixelIndex = (centerY * width + centerX) * 4;
                
                // 获取像素值
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                
                // 转换为灰度值
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                
                // 判断黑白 (使用阈值)
                const isBlack = gray < 128;
                rowData.push(isBlack);
            }
            this.qrData.push(rowData);
        }
        
        this.redrawCanvas();
    }

    redrawCanvas() {
        if (!this.imageLoaded) return;

        // 重新绘制图片（从原始图像数据）
        if (this.imageData) {
            this.ctx.putImageData(this.imageData, 0, 0);
        }
        
        this.drawGrid();
        
        if (this.isDrawing) {
            this.highlightCurrentRow();
        }
        
        // 绘制鼠标悬停高亮（如果有的话）
        if (this.highlightedRow !== undefined && this.highlightedCol !== undefined) {
            this.drawCellHighlight(this.highlightedRow, this.highlightedCol);
        }
    }
    
    drawCellHighlight(row, col) {
        const cellWidth = this.canvas.width / this.qrSize;
        const cellHeight = this.canvas.height / this.qrSize;
        const x = col * cellWidth;
        const y = row * cellHeight;
        
        // 绘制高亮边框
        this.ctx.strokeStyle = '#FF5722';  // 橙色边框
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, cellWidth, cellHeight);
        
        // 填充半透明背景
        this.ctx.fillStyle = 'rgba(255, 87, 34, 0.2)';
        this.ctx.fillRect(x, y, cellWidth, cellHeight);
    }

    drawGrid() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.strokeStyle = '#FF0000';
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.7;
        
        // 绘制垂直线
        for (let i = 0; i <= this.qrSize; i++) {
            const x = (width / this.qrSize) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // 绘制水平线
        for (let i = 0; i <= this.qrSize; i++) {
            const y = (height / this.qrSize) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1;
    }

    handleMouseMove(event) {
        if (!this.imageLoaded) return;

        // 防抖处理：使用 requestAnimationFrame 优化性能
        if (this.mouseMoveRAF) {
            cancelAnimationFrame(this.mouseMoveRAF);
        }
        
        this.mouseMoveRAF = requestAnimationFrame(() => {
            try {
                // 获取canvas的精确边界，考虑CSS变换、边框等因素
                const rect = this.canvas.getBoundingClientRect();
                
                // 计算相对于canvas内部的坐标，考虑设备像素比
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                
                // 精确计算鼠标在canvas内部的坐标
                const x = (event.clientX - rect.left) * scaleX;
                const y = (event.clientY - rect.top) * scaleY;
                
                // 计算每个格子的大小
                const cellWidth = this.canvas.width / this.qrSize;
                const cellHeight = this.canvas.height / this.qrSize;
                
                // 使用更精确的边界检查，考虑浮点数精度
                if (x >= 0 && x <= this.canvas.width && y >= 0 && y <= this.canvas.height) {
                    // 计算行列号，确保从1开始计数
                    let col = Math.floor(x / cellWidth);
                    let row = Math.floor(y / cellHeight);
                    
                    // 边界保护：确保行列号在有效范围内
                    col = Math.max(0, Math.min(col, this.qrSize - 1));
                    row = Math.max(0, Math.min(row, this.qrSize - 1));
                    
                    // 显示坐标（行号和列号都从1开始）
                    this.showCoordinates(row + 1, col + 1);
                    
                    // 高亮当前单元格（可选功能）
                    this.highlightCell(row, col);
                } else {
                    this.hideCoordinates();
                    this.clearCellHighlight();
                }
            } catch (error) {
                console.warn('鼠标坐标计算出错:', error);
                this.hideCoordinates();
            }
        });
    }

    showCoordinates(row, col) {
        const display = document.getElementById('coordinateDisplay');
        
        // 只有当坐标真正改变时才更新DOM，减少不必要的重排重绘
        if (this.lastDisplayedRow !== row || this.lastDisplayedCol !== col) {
            document.getElementById('rowDisplay').textContent = row;
            document.getElementById('colDisplay').textContent = col;
            this.lastDisplayedRow = row;
            this.lastDisplayedCol = col;
        }
        
        display.classList.remove('hidden');
    }

    hideCoordinates() {
        const display = document.getElementById('coordinateDisplay');
        display.classList.add('hidden');
        
        // 清除缓存的坐标值
        this.lastDisplayedRow = null;
        this.lastDisplayedCol = null;
        
        // 清除单元格高亮
        this.clearCellHighlight();
    }
    
    highlightCell(row, col) {
        // 只有当单元格真正改变时才重新绘制
        if (this.highlightedRow === row && this.highlightedCol === col) {
            return;
        }
        
        // 保存当前高亮的单元格位置
        this.highlightedRow = row;
        this.highlightedCol = col;
        
        // 重新绘制画布以显示新的高亮
        this.redrawCanvas();
    }
    
    clearCellHighlight() {
        if (this.highlightedRow !== undefined || this.highlightedCol !== undefined) {
            this.highlightedRow = undefined;
            this.highlightedCol = undefined;
            this.redrawCanvas();  // 重新绘制以清除高亮
        }
    }

    updateCanvasStatus(message) {
        const statusElement = document.getElementById('canvasStatus');
        if (statusElement) {
            statusElement.textContent = message;
            console.log('Canvas Status:', message);
        }
    }

    startDrawing() {
        if (!this.imageLoaded) return;
        
        this.isDrawing = true;
        this.currentStep = 0;
        this.totalSteps = this.qrSize;
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('nextBtn').disabled = false;
        document.getElementById('statusText').textContent = '手绘进行中';
        
        this.updateStepDisplay();
        this.redrawCanvas();
    }

    nextStep() {
        if (!this.isDrawing) return;
        
        this.currentStep++;
        
        if (this.currentStep >= this.totalSteps) {
            this.completeDrawing();
            return;
        }
        
        this.updateStepDisplay();
        this.redrawCanvas();
    }

    updateStepDisplay() {
        const currentRow = this.currentStep + 1;
        const blackCells = [];
        
        // 获取当前行需要涂色的列
        for (let col = 0; col < this.qrSize; col++) {
            if (this.qrData[this.currentStep] && this.qrData[this.currentStep][col]) {
                blackCells.push(col + 1);
            }
        }
        
        // 更新显示
        document.getElementById('currentRow').textContent = currentRow;
        
        let stepDetails = '';
        if (blackCells.length === 0) {
            stepDetails = `第${currentRow}行不需要涂色，保持空白即可。`;
        } else {
            stepDetails = `第${currentRow}行应涂色第${blackCells.join('、')}列。`;
        }
        
        document.getElementById('stepDetails').textContent = stepDetails;
        
        // 更新进度
        const progress = ((this.currentStep + 1) / this.totalSteps) * 100;
        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressText').textContent = `${this.currentStep + 1}/${this.totalSteps}`;
    }

    highlightCurrentRow() {
        if (!this.isDrawing) return;
        
        const cellHeight = this.canvas.height / this.qrSize;
        const y = this.currentStep * cellHeight;
        
        // 高亮当前行
        this.ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
        this.ctx.fillRect(0, y, this.canvas.width, cellHeight);
        
        // 高亮需要涂色的格子
        for (let col = 0; col < this.qrSize; col++) {
            if (this.qrData[this.currentStep] && this.qrData[this.currentStep][col]) {
                const x = col * (this.canvas.width / this.qrSize);
                this.ctx.fillStyle = 'rgba(255, 193, 7, 0.6)';
                this.ctx.fillRect(x, y, this.canvas.width / this.qrSize, cellHeight);
                
                // 绘制边框
                this.ctx.strokeStyle = '#FFC107';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, y, this.canvas.width / this.qrSize, cellHeight);
            }
        }
    }

    completeDrawing() {
        this.isDrawing = false;
        document.getElementById('statusText').textContent = '手绘完成！';
        document.getElementById('stepDetails').textContent = '恭喜！二维码手绘指导已完成。请检查您的手绘作品。';
        document.getElementById('nextBtn').disabled = true;
        
        // 100%进度
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('progressText').textContent = `${this.totalSteps}/${this.totalSteps}`;
        
        this.redrawCanvas();
        
        // 显示完成提示
        setTimeout(() => {
            alert('🎉 手绘指导完成！请检查您的手绘作品。');
        }, 500);
    }

    reset() {
        this.isDrawing = false;
        this.currentStep = 0;
        this.totalSteps = 0;
        
        document.getElementById('startBtn').disabled = !this.imageLoaded;
        document.getElementById('nextBtn').disabled = true;
        document.getElementById('statusText').textContent = '等待开始';
        document.getElementById('stepDetails').textContent = '请先上传二维码图片开始';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0/0';
        document.getElementById('currentRow').textContent = '1';
        
        this.redrawCanvas();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new QRHelper();
});