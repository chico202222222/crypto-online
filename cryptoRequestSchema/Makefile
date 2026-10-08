CXX ?= clang++

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    BREW_PREFIX ?= /opt/homebrew
    CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -I$(BREW_PREFIX)/include
    LDFLAGS = -L$(BREW_PREFIX)/lib -lcpr -lmatplot
else
    CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -I/usr/local/include -I/usr/include
    LDFLAGS = -L/usr/local/lib -L/usr/lib -lcpr -lmatplot
endif

SRCS = crowStarter.cpp getValue.cpp
OBJS = $(SRCS:.cpp=.o)
TARGET = server

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) $(LDFLAGS) -o $(TARGET)

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET) *.png

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run
