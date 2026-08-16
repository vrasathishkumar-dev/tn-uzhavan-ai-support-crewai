.PHONY: help install run-backend run-frontend dev eval build clean

help:
	@echo "Buildathon Support Crew - Commands:"
	@echo "  make install      - Install backend and frontend dependencies"
	@echo "  make run-backend  - Start FastAPI backend server on port 8000"
	@echo "  make run-frontend - Start Next.js frontend dev server on port 3000"
	@echo "  make eval         - Run evaluation benchmark and accuracy metrics"
	@echo "  make build        - Build Next.js production frontend"
	@echo "  make docker-up    - Run full stack using Docker Compose"

install:
	pip install -r requirements.txt
	cd frontend && yarn install

run-backend:
	cd backend && uvicorn main:app --reload --port 8000

run-frontend:
	cd frontend && yarn dev

eval:
	python3 evaluation/run_evaluation.py

build:
	cd frontend && yarn build

docker-up:
	docker-compose up --build
